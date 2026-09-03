import { randomUUID } from "node:crypto";
import type { PlayerView, RoomView } from "@buzzroom/shared";
import { generateRoomCode } from "./generateRoomCode.js";
import type { Round } from "./round.js";
import { toRoundView } from "./round.js";

// ---------- Internal server-side models ----------

export interface RoomSettings {
  earlyBuzzPenalty: boolean; // default on; penalises buzzing during closed rounds
}

export interface Player {
  playerId: string;
  socketId: string; // current socket connection — changes on reconnect
  name: string;
  score: number;
  isConnected: boolean;
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
  settings: RoomSettings;
  round: Round | null; // null = no active buzz round
  createdAt: number;
  lastActivityAt: number;
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
      settings: { earlyBuzzPenalty: true },
      round: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
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
   * Removes the player associated with a given socketId.
   * Returns the affected room and player so callers can emit the right
   * events, or undefined if this socket wasn't in any room.
   */
  removePlayerBySocketId(
    socketId: string,
  ): { room: Room; player: Player } | undefined {
    const roomId = this.socketIndex.get(socketId);
    if (!roomId) return undefined;

    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    const player = Array.from(room.players.values()).find(
      (p) => p.socketId === socketId,
    );
    if (!player) return undefined;

    room.players.delete(player.playerId);
    this.socketIndex.delete(socketId);
    room.lastActivityAt = Date.now();

    // If the room is now empty, clean it up immediately rather than
    // waiting for the periodic cleanup job.
    if (room.players.size === 0) {
      this.rooms.delete(roomId);
      this.codeIndex.delete(room.roomCode);
    }

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
      round: room.round ? toRoundView(room.round) : null,
    };
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
          this.socketIndex.delete(player.socketId);
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
