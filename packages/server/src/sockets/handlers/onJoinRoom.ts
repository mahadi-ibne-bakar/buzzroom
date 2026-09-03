import type { JoinRoomPayload } from "@buzzroom/shared";
import { MAX_PLAYERS } from "../../constants.js";
import type { RoomStore } from "../../rooms/RoomStore.js";
import { sanitizeName } from "../../rooms/sanitize.js";
import type { TypedServer, TypedSocket } from "../../socketTypes.js";

export function onJoinRoom(
  _io: TypedServer,
  socket: TypedSocket,
  store: RoomStore,
  payload: JoinRoomPayload,
): void {
  const room = store.getByCode(payload.roomCode);
  if (!room) {
    socket.emit("server_error", {
      code: "ROOM_NOT_FOUND",
      message: `No room found with code "${payload.roomCode}".`,
    });
    return;
  }

  const name = sanitizeName(payload.playerName);
  if (name.length === 0) {
    socket.emit("server_error", {
      code: "NAME_INVALID",
      message: "Name must contain at least one visible character.",
    });
    return;
  }

  // Duplicate name check — case-insensitive, only among connected players
  // (a disconnected player's name slot is freed so others can reuse it)
  const nameTaken = Array.from(room.players.values()).some(
    (p) => p.isConnected && p.name.toLowerCase() === name.toLowerCase(),
  );
  if (nameTaken) {
    socket.emit("server_error", {
      code: "NAME_TAKEN",
      message: `"${name}" is already taken in this room.`,
    });
    return;
  }

  const connectedCount = Array.from(room.players.values()).filter(
    (p) => p.isConnected,
  ).length;
  if (connectedCount >= MAX_PLAYERS) {
    socket.emit("server_error", {
      code: "ROOM_FULL",
      message: `This room is full (${MAX_PLAYERS} players maximum).`,
    });
    return;
  }

  const player = store.addPlayer(room.roomId, socket.id, name);
  if (!player) {
    // Should not happen (room just found above), but guard anyway
    socket.emit("server_error", {
      code: "ROOM_NOT_FOUND",
      message: "Room disappeared unexpectedly. Please try again.",
    });
    return;
  }

  void socket.join(room.roomId);

  // Send the full current room state to the joining player
  socket.emit("join_ok", {
    room: store.toRoomView(room),
    yourPlayerId: player.playerId,
  });

  // Broadcast the new player to everyone already in the room.
  // socket.to() sends to everyone in the channel *except* this socket,
  // which is correct — the joiner already knows about themselves via join_ok.
  socket.to(room.roomId).emit("player_joined", {
    player: store.toPlayerView(player),
  });

  console.log(`[room] "${name}" joined ${room.roomCode} (socket ${socket.id})`);
}
