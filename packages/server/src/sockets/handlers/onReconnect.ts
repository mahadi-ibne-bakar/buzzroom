import type { ReconnectRoomPayload } from "@buzzroom/shared";
import type { RoomStore } from "../../rooms/RoomStore.js";
import type { TypedServer, TypedSocket } from "../../socketTypes.js";

/**
 * Rejoins a player to a room they were already in, using the playerId their
 * browser kept in session storage.
 *
 * This is deliberately not the same as join_room: it takes no name, creates
 * no new player, and skips the duplicate-name and room-full checks -- the
 * player already holds a seat, they just lost the socket attached to it.
 * Their score and any buzz they already submitted this round survive.
 */
export function onReconnect(
  _io: TypedServer,
  socket: TypedSocket,
  store: RoomStore,
  payload: ReconnectRoomPayload,
): void {
  const result = store.reconnectPlayer(
    payload.roomCode,
    payload.playerId,
    socket.id,
  );

  if (!result) {
    // Either the room expired or this playerId was never in it. The client
    // treats this as "your session is stale" and drops back to the landing
    // screen rather than retrying.
    socket.emit("server_error", {
      code: "ROOM_NOT_FOUND",
      message: "That game is no longer available.",
    });
    return;
  }

  const { room, player } = result;

  void socket.join(room.roomId);

  socket.emit("reconnect_ok", {
    room: store.toRoomView(room),
    yourPlayerId: player.playerId,
  });

  // Tell everyone else this player is back. player_joined is an upsert on
  // the client, so it flips isConnected on the existing row rather than
  // adding a duplicate.
  socket.to(room.roomId).emit("player_joined", {
    player: store.toPlayerView(player),
  });

  console.log(
    `[room] "${player.name}" reconnected to ${room.roomCode} ` +
      `(socket ${socket.id})`,
  );
}
