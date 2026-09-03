import type { RoomStore } from "../../rooms/RoomStore.js";
import { getHostRoom } from "../authHelpers.js";
import type { TypedServer, TypedSocket } from "../../socketTypes.js";

export function onResetRound(
  io: TypedServer,
  socket: TypedSocket,
  store: RoomStore,
): void {
  const room = getHostRoom(socket, store);
  if (!room) return;

  room.round = null;
  store.bumpActivity(room.roomId);

  io.to(room.roomId).emit("round_reset");

  console.log(`[round] reset in ${room.roomCode}`);
}
