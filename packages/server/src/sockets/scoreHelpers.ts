import type { Room, RoomStore } from "../rooms/RoomStore.js";
import { buildLeaderboard } from "../rooms/leaderboard.js";
import type { TypedServer } from "../socketTypes.js";

/**
 * Computes the current leaderboard and broadcasts a score_update event to
 * every socket in the room.
 *
 * Why a shared helper rather than inline in each handler?
 *   score_update now carries both players (raw) and leaderboard (sorted,
 *   ranked). Having two handlers independently build that payload means
 *   either one could forget the leaderboard field or sort differently.
 *   One helper = one source of truth for what "score update" means.
 */
export function emitScoreUpdate(
  io: TypedServer,
  room: Room,
  store: RoomStore,
): void {
  const players = Array.from(room.players.values());

  io.to(room.roomId).emit("score_update", {
    players: players.map((p) => store.toPlayerView(p)),
    leaderboard: buildLeaderboard(players),
  });
}
