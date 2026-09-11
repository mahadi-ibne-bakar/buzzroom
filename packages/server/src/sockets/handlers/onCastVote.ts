import type { CastVotePayload } from "@buzzroom/shared";
import { castVote, toVoteTally } from "../../rooms/round.js";
import type { RoomStore } from "../../rooms/RoomStore.js";
import type { TypedServer, TypedSocket } from "../../socketTypes.js";

/**
 * Registers an audience vote on the answer currently being given.
 *
 * Advisory only: the tally never touches a score. It exists so the host can
 * read the room before ruling, and so everyone who isn't answering has
 * something to do during the pause.
 */
export function onCastVote(
  io: TypedServer,
  socket: TypedSocket,
  store: RoomStore,
  payload: CastVotePayload,
): void {
  const context = store.getPlayerBySocketId(socket.id);
  if (!context) {
    socket.emit("server_error", {
      code: "ROOM_NOT_FOUND",
      message: "You are not in a room.",
    });
    return;
  }

  const { room, player } = context;

  if (!room.settings.audienceVoting) {
    socket.emit("server_error", {
      code: "INVALID_STATE",
      message: "Audience voting is off for this room.",
    });
    return;
  }

  if (!room.round) {
    socket.emit("server_error", {
      code: "NO_ACTIVE_ROUND",
      message: "No buzz round is currently active.",
    });
    return;
  }

  const result = castVote(room.round, player.playerId, payload.vote);

  if (result.type === "no_active_player") {
    socket.emit("server_error", {
      code: "INVALID_STATE",
      message: "Nobody has been called on yet.",
    });
    return;
  }

  if (result.type === "cannot_vote_on_self") {
    socket.emit("server_error", {
      code: "INVALID_STATE",
      message: "You can't vote on your own answer.",
    });
    return;
  }

  io.to(room.roomId).emit("vote_tally", { tally: toVoteTally(room.round) });
}
