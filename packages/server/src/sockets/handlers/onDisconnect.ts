import type { RoomStore } from "../../rooms/RoomStore.js";
import type { TypedServer, TypedSocket } from "../../socketTypes.js";

export function onDisconnect(
  io: TypedServer,
  socket: TypedSocket,
  store: RoomStore,
): void {
  const result = store.removePlayerBySocketId(socket.id);
  if (!result) return; // this socket wasn't in a room

  const { room, player } = result;

  // We use io.to() rather than socket.to() here because by the time
  // "disconnect" fires, the socket has already left all Socket.io
  // channels. socket.to() would broadcast to nobody.
  io.to(room.roomId).emit("player_left", {
    playerId: player.playerId,
    playerName: player.name,
  });

  console.log(
    `[room] "${player.name}" left ${room.roomCode} (socket ${socket.id})`,
  );
}
