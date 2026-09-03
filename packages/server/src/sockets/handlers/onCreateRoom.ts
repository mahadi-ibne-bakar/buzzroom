import type { CreateRoomPayload } from "@buzzroom/shared";
import type { RoomStore } from "../../rooms/RoomStore.js";
import { sanitizeName } from "../../rooms/sanitize.js";
import type { TypedServer, TypedSocket } from "../../socketTypes.js";

export function onCreateRoom(
  _io: TypedServer,
  socket: TypedSocket,
  store: RoomStore,
  payload: CreateRoomPayload,
): void {
  const name = sanitizeName(payload.hostName);
  if (name.length === 0) {
    socket.emit("server_error", {
      code: "NAME_INVALID",
      message: "Name must contain at least one visible character.",
    });
    return;
  }

  const { room, player } = store.createRoom(socket.id, name);

  // socket.join() places this socket into a Socket.io "room" — an
  // internal pub/sub channel. We name it after our roomId (the UUID),
  // not the roomCode. The roomCode is the short human-facing code;
  // the roomId is the stable internal key we use for routing events.
  void socket.join(room.roomId);

  socket.emit("room_created", {
    room: store.toRoomView(room),
    yourPlayerId: player.playerId,
  });

  console.log(
    `[room] created ${room.roomCode} by "${name}" (socket ${socket.id})`,
  );
}
