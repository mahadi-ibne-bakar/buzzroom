import type { Room, RoomStore } from "../rooms/RoomStore.js";
import {
  buildLeaderboard,
  buildTeamLeaderboard,
} from "../rooms/leaderboard.js";
import type { TypedServer } from "../socketTypes.js";

/**
 * Computes the current boards and broadcasts a score_update to every socket
 * in the room.
 *
 * Why a shared helper rather than inline in each handler?
 *   score_update carries players (raw), the individual leaderboard, and the
 *   team leaderboard. Having each handler independently build that payload
 *   means one could forget a field or sort differently. One helper = one
 *   source of truth for what "score update" means.
 */
export function emitScoreUpdate(
  io: TypedServer,
  room: Room,
  store: RoomStore,
): void {
  io.to(room.roomId).emit("score_update", buildScoreUpdate(room, store));
}

/**
 * The score_update payload for a room. Split out so watch_ok and the team
 * handlers can send the same shape without re-deriving it.
 */
export function buildScoreUpdate(room: Room, store: RoomStore) {
  const players = Array.from(room.players.values());

  return {
    players: players.map((p) => store.toPlayerView(p)),
    leaderboard: buildLeaderboard(players),
    // Deliberately empty when team mode is off, rather than omitted: clients
    // can render straight from it without also checking the setting.
    teamLeaderboard: room.settings.teamsEnabled
      ? buildTeamLeaderboard(players, Array.from(room.teams.values()))
      : [],
  };
}
