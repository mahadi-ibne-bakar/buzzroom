import type { UpdateSettingsPayload } from "@buzzroom/shared";
import type { RoomStore } from "../../rooms/RoomStore.js";
import { getHostRoom } from "../authHelpers.js";
import type { TypedServer, TypedSocket } from "../../socketTypes.js";

/**
 * Applies a host-only settings change and tells the room about it.
 *
 * open_buzz can also carry the window mode (spec §11), but the host needs to
 * be able to switch to free buzz *before* opening anything -- that is the
 * case the mode exists for -- so it gets its own event too.
 */
export function onUpdateSettings(
  io: TypedServer,
  socket: TypedSocket,
  store: RoomStore,
  payload: UpdateSettingsPayload,
): void {
  const room = getHostRoom(socket, store);
  if (!room) return;

  store.updateSettings(room, payload);

  io.to(room.roomId).emit("settings_updated", {
    settings: store.toSettingsView(room),
  });

  console.log(
    `[settings] ${room.roomCode}: window=${room.settings.buzzWindowMode} ` +
      `earlyBuzzPenalty=${room.settings.earlyBuzzPenalty}`,
  );
}
