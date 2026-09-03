import type { OpenBuzzPayload } from "@buzzroom/shared";
import { createRound, toRoundView } from "../../rooms/round.js";
import type { RoomStore } from "../../rooms/RoomStore.js";
import { getHostRoom } from "../authHelpers.js";
import type { TypedServer, TypedSocket } from "../../socketTypes.js";

export function onOpenBuzz(
  io: TypedServer,
  socket: TypedSocket,
  store: RoomStore,
  payload: OpenBuzzPayload,
): void {
  const room = getHostRoom(socket, store);
  if (!room) return;

  // Silently replace any previous round rather than forcing the host to
  // reset first. The most common mistake is opening twice by accident;
  // erroring on it is annoying, discarding and restarting is the right UX.
  room.round = createRound(payload.buzzMode);
  store.bumpActivity(room.roomId);

  io.to(room.roomId).emit("round_opened", {
    round: toRoundView(room.round),
  });

  console.log(
    `[round] opened in ${room.roomCode} ` +
      `(mode: ${room.round.modeParams.mode}, id: ${room.round.roundId})`,
  );
}
