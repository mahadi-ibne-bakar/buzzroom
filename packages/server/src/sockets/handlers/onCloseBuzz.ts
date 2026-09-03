import type { RoomStore } from "../../rooms/RoomStore.js";
import { getHostRoom } from "../authHelpers.js";
import type { TypedServer, TypedSocket } from "../../socketTypes.js";

export function onCloseBuzz(
  io: TypedServer,
  socket: TypedSocket,
  store: RoomStore,
): void {
  const room = getHostRoom(socket, store);
  if (!room) return;

  if (!room.round || room.round.status === "closed") {
    socket.emit("server_error", {
      code: "INVALID_STATE",
      message: "No open round to close.",
    });
    return;
  }

  room.round.status = "closed";
  store.bumpActivity(room.roomId);

  // No payload — the round state already has status "closed" if the client
  // re-requests it. The event itself is the signal to stop the buzz UI.
  io.to(room.roomId).emit("round_closed");

  console.log(`[round] closed in ${room.roomCode}`);
}
