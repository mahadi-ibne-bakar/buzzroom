import type { WatchRoomPayload } from "@buzzroom/shared";
import { buildLeaderboard } from "../../rooms/leaderboard.js";
import type { RoomStore } from "../../rooms/RoomStore.js";
import type { TypedServer, TypedSocket } from "../../socketTypes.js";

/**
 * Attaches a presenter screen to a room as an observer.
 *
 * An observer is deliberately *not* a player: no record in room.players, no
 * name, no seat against MAX_PLAYERS, nothing in the leaderboard. All it does
 * is join the Socket.io channel so it receives every broadcast the room
 * already emits, and take one state snapshot to render from.
 *
 * Because it has no player record it is also absent from the store's socket
 * index, which means onDisconnect finds nothing and correctly treats a
 * presenter closing its tab as a non-event.
 */
export function onWatchRoom(
  _io: TypedServer,
  socket: TypedSocket,
  store: RoomStore,
  payload: WatchRoomPayload,
): void {
  const room = store.getByCode(payload.roomCode);
  if (!room) {
    socket.emit("server_error", {
      code: "ROOM_NOT_FOUND",
      message: `No room found with code "${payload.roomCode}".`,
    });
    return;
  }

  void socket.join(room.roomId);

  // The leaderboard rides along because score_update -- the event that
  // normally carries it -- only fires when a score changes. A presenter
  // attached mid-game would otherwise show an empty board until the next
  // point was awarded.
  socket.emit("watch_ok", {
    room: store.toRoomView(room),
    leaderboard: buildLeaderboard(Array.from(room.players.values())),
  });

  console.log(`[room] presenter attached to ${room.roomCode}`);
}
