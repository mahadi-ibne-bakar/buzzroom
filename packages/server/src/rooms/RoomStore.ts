import { randomUUID } from "node:crypto";
import type {
  BuzzWindowMode,
  PlayerView,
  RoomSettingsView,
  RoomView,
  TeamView,
} from "@buzzroom/shared";
import { TEAM_COLOURS, MAX_TEAMS } from "../constants.js";
import { generateRoomCode } from "./generateRoomCode.js";
import type { Round } from "./round.js";
import { toRoundView } from "./round.js";

// ---------- Internal server-side models ----------

export interface RoomSettings {
  // "locked" (default) means a buzz only counts once the host opens the
  // window; "free" means players may buzz whenever they like. See spec §5.
  buzzWindowMode: BuzzWindowMode;
  earlyBuzzPenalty: boolean; // default on; penalises buzzing during closed rounds
  teamsEnabled: boolean; // default off; ranks teams instead of individuals
  audienceVoting: boolean; // default off; advisory agree/disagree tally
}

export interface Team {
  teamId: string;
  name: string;
  colour: string;
}

export interface Player {
  playerId: string;
  socketId: string; // current socket connection — changes on reconnect
  name: string;
  score: number;
  isConnected: boolean;
  teamId: string | null;
  joinedAt: number;
  // Clock-sync fields; populated in Phase 5 (fairness engine)
  clockOffset: number;
  lastRtt: number | null;
}

export interface Room {
  roomId: string;
  roomCode: string;
  hostPlayerId: string;
  hostSocketId: string;
  players: Map<string, Player>; // playerId → Player
  teams: Map<string, Team>; // teamId → Team
  settings: RoomSettings;
  round: Round | null; // null = no active buzz round
  createdAt: number;
  lastActivityAt: number;
  // Throttle for ping_update broadcasts. Players sync every few seconds each,
  // so without this a 20-player room would fan out a broadcast per ping.
  lastPingBroadcastAt: number;
}

// ---------- RoomStore ----------

export class RoomStore {
  // Primary store: roomId → Room
  private readonly rooms = new Map<string, Room>();
  // Fast lookup for join requests: roomCode → roomId
  private readonly codeIndex = new Map<string, string>();
  // Fast lookup for disconnect handling: socketId → roomId
  private readonly socketIndex = new Map<string, string>();

  // ---------- Create ----------

  createRoom(
    hostSocketId: string,
    hostName: string,
  ): { room: Room; player: Player } {
    const roomId = randomUUID();
    const playerId = randomUUID();

    // Guarantee code uniqueness — collisions are astronomically rare
    // at game-night scale, but this loop costs nothing.
    let roomCode: string;
    do {
      roomCode = generateRoomCode();
    } while (this.codeIndex.has(roomCode));

    const player: Player = {
      playerId,
      socketId: hostSocketId,
      name: hostName,
      score: 0,
      isConnected: true,
      teamId: null,
      joinedAt: Date.now(),
      clockOffset: 0,
      lastRtt: null,
    };

    const room: Room = {
      roomId,
      roomCode,
      hostPlayerId: playerId,
      hostSocketId,
      players: new Map([[playerId, player]]),
      teams: new Map(),
      settings: {
        buzzWindowMode: "locked",
        earlyBuzzPenalty: true,
        teamsEnabled: false,
        audienceVoting: false,
      },
      round: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      lastPingBroadcastAt: 0,
    };

    this.rooms.set(roomId, room);
    this.codeIndex.set(roomCode, roomId);
    this.socketIndex.set(hostSocketId, roomId);

    return { room, player };
  }

  // ---------- Add player ----------

  addPlayer(
    roomId: string,
    socketId: string,
    name: string,
  ): Player | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    const player: Player = {
      playerId: randomUUID(),
      socketId,
      name,
      score: 0,
      isConnected: true,
      teamId: null,
      joinedAt: Date.now(),
      clockOffset: 0,
      lastRtt: null,
    };

    room.players.set(player.playerId, player);
    this.socketIndex.set(socketId, roomId);
    room.lastActivityAt = Date.now();

    return player;
  }

  // ---------- Remove player ----------

  /**
   * Marks the player on a given socketId as disconnected.
   *
   * The player record is deliberately *kept*. Spec §12 requires that a
   * player who drops out mid-round can come back on the same playerId with
   * their score and their already-submitted buzz intact, so the record has
   * to outlive the socket. Deleting it here would also wipe the scoreboard
   * of anyone whose phone briefly lost signal.
   *
   * Returns the affected room and player so callers can emit the right
   * events, plus whether that player was the host, or undefined if this
   * socket wasn't in any room.
   */
  markDisconnectedBySocketId(
    socketId: string,
  ): { room: Room; player: Player; wasHost: boolean } | undefined {
    const roomId = this.socketIndex.get(socketId);
    if (!roomId) return undefined;

    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    const player = Array.from(room.players.values()).find(
      (p) => p.socketId === socketId,
    );
    if (!player) return undefined;

    const wasHost = player.playerId === room.hostPlayerId;

    player.isConnected = false;
    player.socketId = "";
    this.socketIndex.delete(socketId);
    room.lastActivityAt = Date.now();

    // Rooms are no longer torn down the moment they empty -- everyone might
    // be mid-reconnect. An empty room is left to the periodic cleanup job,
    // which expires it after ROOM_MAX_AGE_MS of no activity.

    return { room, player, wasHost };
  }

  /**
   * Rebinds an existing player record to a new socket.
   *
   * Returns undefined when the room code is unknown or no such player is in
   * it, so a stale session in a browser tab can't resurrect a room that has
   * already been cleaned up.
   */
  reconnectPlayer(
    roomCode: string,
    playerId: string,
    socketId: string,
  ): { room: Room; player: Player } | undefined {
    const room = this.getByCode(roomCode);
    if (!room) return undefined;

    const player = room.players.get(playerId);
    if (!player) return undefined;

    // Drop the index entry for the socket this player used to hold, if any,
    // so a stale socketId can never resolve back to this room.
    if (player.socketId) this.socketIndex.delete(player.socketId);

    player.socketId = socketId;
    player.isConnected = true;
    this.socketIndex.set(socketId, room.roomId);

    // getHostRoom() authorises host actions by comparing socket.id against
    // room.hostSocketId, so without this a reconnected host would be locked
    // out of every control on their own game.
    if (player.playerId === room.hostPlayerId) room.hostSocketId = socketId;

    room.lastActivityAt = Date.now();

    return { room, player };
  }

  // ---------- Points ----------

  /**
   * Adjusts a player's score by delta (positive = award, negative = deduct).
   * Returns the updated player, or undefined if the room/player doesn't exist.
   */
  awardPoints(
    roomId: string,
    playerId: string,
    delta: number,
  ): Player | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    const player = room.players.get(playerId);
    if (!player) return undefined;

    player.score += delta;
    room.lastActivityAt = Date.now();

    return player;
  }

  // ---------- Lookups ----------

  getByRoomId(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getByCode(code: string): Room | undefined {
    const roomId = this.codeIndex.get(code.toUpperCase());
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  getRoomBySocketId(socketId: string): Room | undefined {
    const roomId = this.socketIndex.get(socketId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  /**
   * Finds the player record for a given socket within their room.
   * O(n) in players per room (max 20) — acceptable.
   */
  getPlayerBySocketId(
    socketId: string,
  ): { room: Room; player: Player } | undefined {
    const room = this.getRoomBySocketId(socketId);
    if (!room) return undefined;

    const player = Array.from(room.players.values()).find(
      (p) => p.socketId === socketId,
    );
    if (!player) return undefined;

    return { room, player };
  }

  // ---------- View helpers ----------

  toPlayerView(player: Player): PlayerView {
    return {
      playerId: player.playerId,
      name: player.name,
      score: player.score,
      isConnected: player.isConnected,
      rttMs: player.lastRtt,
      teamId: player.teamId,
    };
  }

  toRoomView(room: Room): RoomView {
    return {
      roomId: room.roomId,
      roomCode: room.roomCode,
      hostPlayerId: room.hostPlayerId,
      players: Array.from(room.players.values()).map((p) =>
        this.toPlayerView(p),
      ),
      teams: this.toTeamViews(room),
      settings: this.toSettingsView(room),
      round: room.round ? toRoundView(room.round) : null,
    };
  }

  toSettingsView(room: Room): RoomSettingsView {
    return {
      buzzWindowMode: room.settings.buzzWindowMode,
      earlyBuzzPenalty: room.settings.earlyBuzzPenalty,
      teamsEnabled: room.settings.teamsEnabled,
      audienceVoting: room.settings.audienceVoting,
    };
  }

  toTeamViews(room: Room): TeamView[] {
    return Array.from(room.teams.values()).map((t) => ({
      teamId: t.teamId,
      name: t.name,
      colour: t.colour,
    }));
  }

  // ---------- Teams ----------

  /**
   * Creates a team, taking the first palette colour no existing team is
   * using so two teams are never the same colour on the big screen.
   * Returns undefined once MAX_TEAMS is reached.
   */
  createTeam(room: Room, name: string): Team | undefined {
    if (room.teams.size >= MAX_TEAMS) return undefined;

    const taken = new Set(Array.from(room.teams.values()).map((t) => t.colour));
    const colour = TEAM_COLOURS.find((c) => !taken.has(c)) ?? TEAM_COLOURS[0]!;

    const team: Team = { teamId: randomUUID(), name, colour };
    room.teams.set(team.teamId, team);
    room.lastActivityAt = Date.now();
    return team;
  }

  /**
   * Removes a team and releases its members back to unassigned. Their scores
   * are untouched -- the score lives on the player, and the team total was
   * only ever a sum of those.
   */
  deleteTeam(room: Room, teamId: string): boolean {
    if (!room.teams.delete(teamId)) return false;

    for (const player of room.players.values()) {
      if (player.teamId === teamId) player.teamId = null;
    }
    room.lastActivityAt = Date.now();
    return true;
  }

  /** Moves a player onto a team, or off every team when teamId is null. */
  assignTeam(room: Room, playerId: string, teamId: string | null): boolean {
    const player = room.players.get(playerId);
    if (!player) return false;
    if (teamId !== null && !room.teams.has(teamId)) return false;

    player.teamId = teamId;
    room.lastActivityAt = Date.now();
    return true;
  }

  // ---------- Settings ----------

  /**
   * Applies a partial settings change. Undefined fields are left alone, so
   * callers can send a single toggle without restating the rest.
   */
  updateSettings(room: Room, patch: Partial<RoomSettings>): RoomSettings {
    if (patch.buzzWindowMode !== undefined) {
      room.settings.buzzWindowMode = patch.buzzWindowMode;
    }
    if (patch.earlyBuzzPenalty !== undefined) {
      room.settings.earlyBuzzPenalty = patch.earlyBuzzPenalty;
    }
    if (patch.teamsEnabled !== undefined) {
      room.settings.teamsEnabled = patch.teamsEnabled;
    }
    if (patch.audienceVoting !== undefined) {
      room.settings.audienceVoting = patch.audienceVoting;
    }
    room.lastActivityAt = Date.now();
    return room.settings;
  }

  // ---------- Activity & cleanup ----------

  bumpActivity(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) room.lastActivityAt = Date.now();
  }

  /**
   * Removes all rooms that have had no activity for longer than maxAgeMs.
   * Returns the number of rooms removed.
   */
  cleanupStaleRooms(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    let count = 0;

    for (const [roomId, room] of this.rooms) {
      if (room.lastActivityAt < cutoff) {
        for (const player of room.players.values()) {
          if (player.socketId) this.socketIndex.delete(player.socketId);
        }
        this.codeIndex.delete(room.roomCode);
        this.rooms.delete(roomId);
        count++;
      }
    }

    return count;
  }

  startCleanupInterval(intervalMs: number, maxAgeMs: number): () => void {
    const timer = setInterval(() => {
      const removed = this.cleanupStaleRooms(maxAgeMs);
      if (removed > 0) {
        console.log(`[RoomStore] cleaned up ${removed} stale room(s)`);
      }
    }, intervalMs);

    timer.unref();
    return () => clearInterval(timer);
  }

  // ---------- Diagnostics ----------

  get roomCount(): number {
    return this.rooms.size;
  }
}
