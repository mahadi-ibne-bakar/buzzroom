import type { Room, RoomStore } from "../rooms/RoomStore.js";
import type { TypedSocket } from "../socketTypes.js";

/**
 * Looks up the room for a socket and verifies it's the host.
 * Emits a server_error and returns null if either check fails,
 * so callers can do a simple `if (!room) return` guard.
 *
 * Why check the host this way rather than a separate "role" field?
 * The host's socket.id is stored when the room is created. Any action
 * that claims to be from the host but comes from a different socket.id
 * is either a bug or a spoofed event — either way, reject it.
 */
export function getHostRoom(
  socket: TypedSocket,
  store: RoomStore,
): Room | null {
  const room = store.getRoomBySocketId(socket.id);

  if (!room) {
    socket.emit("server_error", {
      code: "ROOM_NOT_FOUND",
      message: "You are not in a room.",
    });
    return null;
  }

  if (socket.id !== room.hostSocketId) {
    socket.emit("server_error", {
      code: "UNAUTHORIZED",
      message: "Only the host can perform this action.",
    });
    return null;
  }

  return room;
}
