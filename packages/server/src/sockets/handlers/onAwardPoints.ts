import type { AwardPointsPayload } from "@buzzroom/shared";
import type { RoomStore } from "../../rooms/RoomStore.js";
import { getHostRoom } from "../authHelpers.js";
import { emitScoreUpdate } from "../scoreHelpers.js";
import type { TypedServer, TypedSocket } from "../../socketTypes.js";

export function onAwardPoints(
  io: TypedServer,
  socket: TypedSocket,
  store: RoomStore,
  payload: AwardPointsPayload,
): void {
  const room = getHostRoom(socket, store);
  if (!room) return;

  // Verify the target player is actually in this room.
  // A uuid that looks valid but belongs to a different room must be rejected.
  if (!room.players.has(payload.playerId)) {
    socket.emit("server_error", {
      code: "ROOM_NOT_FOUND",
      message: "Player not found in this room.",
    });
    return;
  }

  const updated = store.awardPoints(
    room.roomId,
    payload.playerId,
    payload.delta,
  );
  if (!updated) return; // room vanished between the check above and now (race)

  const direction = payload.delta > 0 ? "+" : "";
  console.log(
    `[score] "${updated.name}" ${direction}${payload.delta} ` +
      `→ ${updated.score} in ${room.roomCode}`,
  );

  emitScoreUpdate(io, room, store);
}
