import type { RoomStore } from "../../rooms/RoomStore.js";
import type { TypedServer, TypedSocket } from "../../socketTypes.js";

export function onDisconnect(
  io: TypedServer,
  socket: TypedSocket,
  store: RoomStore,
): void {
  const result = store.markDisconnectedBySocketId(socket.id);
  if (!result) return; // this socket wasn't in a room

  const { room, player, wasHost } = result;

  // We use io.to() rather than socket.to() here because by the time
  // "disconnect" fires, the socket has already left all Socket.io
  // channels. socket.to() would broadcast to nobody.
  io.to(room.roomId).emit("player_left", {
    playerId: player.playerId,
    playerName: player.name,
  });

  // Spec §12: a host disconnect pauses the game rather than ending it --
  // there is no host migration in v1. Players get told so their screens can
  // say why nothing is happening, and the host can reconnect into the same
  // room on the same playerId.
  if (wasHost) {
    io.to(room.roomId).emit("host_left");
  }

  console.log(
    `[room] "${player.name}" disconnected from ${room.roomCode} ` +
      `(socket ${socket.id})${wasHost ? " -- was host" : ""}`,
  );
}
