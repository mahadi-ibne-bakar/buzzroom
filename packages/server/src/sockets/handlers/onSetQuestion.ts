import type { SetQuestionPayload } from "@buzzroom/shared";
import type { RoomStore } from "../../rooms/RoomStore.js";
import { getHostRoom } from "../authHelpers.js";
import type { TypedServer, TypedSocket } from "../../socketTypes.js";

/**
 * Sets the question the host is currently on, so the presenter screen can
 * show it.
 *
 * Only the current line lives here. The bank itself stays in the host's
 * browser: questions are the host's own material, they'd be the one thing in
 * this app worth persisting between sessions, and v1 deliberately has no
 * database to persist them in.
 */
export function onSetQuestion(
  io: TypedServer,
  socket: TypedSocket,
  store: RoomStore,
  payload: SetQuestionPayload,
): void {
  const room = getHostRoom(socket, store);
  if (!room) return;

  room.currentQuestion = payload.text.trim();
  store.bumpActivity(room.roomId);

  io.to(room.roomId).emit("question_changed", { text: room.currentQuestion });
}
