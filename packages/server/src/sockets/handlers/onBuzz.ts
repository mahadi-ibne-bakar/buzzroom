import type { BuzzPayload } from "@buzzroom/shared";
import {
  checkBuzzCredentials,
  createRound,
  processBuzz,
  getActiveEntry,
  toBuzzEntryView,
  toRoundView,
  toVoteTally,
} from "../../rooms/round.js";
import type { RoomStore } from "../../rooms/RoomStore.js";
import type { TypedServer, TypedSocket } from "../../socketTypes.js";

export function onBuzz(
  io: TypedServer,
  socket: TypedSocket,
  store: RoomStore,
  payload: BuzzPayload,
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

  if (!room.round) {
    // Under "free" the players may buzz before the host opens anything
    // (spec §5), so the first buzz implicitly opens the round. There were no
    // gesture parameters to broadcast in advance, so an implicitly opened
    // round is always plain button mode.
    if (room.settings.buzzWindowMode !== "free") {
      socket.emit("server_error", {
        code: "NO_ACTIVE_ROUND",
        message: "No buzz round is currently active.",
      });
      return;
    }

    room.round = createRound("button");
    io.to(room.roomId).emit("round_opened", {
      round: toRoundView(room.round),
    });
    console.log(
      `[round] free-buzz round opened by "${player.name}" in ${room.roomCode} ` +
        `(id: ${room.round.roundId})`,
    );
  }

  // Verify the buzz presents this round's gesture credentials before it is
  // allowed anywhere near the ranking. Without this a player could skip the
  // slide or pattern entirely and emit a bare "buzz" event, which would make
  // the gesture modes decorative.
  const credentials = checkBuzzCredentials(room.round, payload);
  if (!credentials.ok) {
    socket.emit("server_error", {
      code: "VALIDATION_ERROR",
      message:
        credentials.reason === "wrong_mode"
          ? "That buzz is for a different input mode than this round."
          : credentials.reason === "bad_token"
            ? "That buzz is not for the current round."
            : "The pattern you traced does not match this round's pattern.",
    });
    console.log(
      `[buzz] rejected "${player.name}" in ${room.roomCode} ` +
        `(${credentials.reason})`,
    );
    return;
  }

  const serverTime = Date.now();

  // Pass payload.adjustedTime to processBuzz.
  // The function clamps it before storing, so a malicious client
  // cannot win by backdating their timestamp.
  const result = processBuzz(
    room.round,
    player.playerId,
    player.name,
    serverTime,
    payload.adjustedTime,
    room.settings.earlyBuzzPenalty,
    payload.mode,
    room.settings.buzzWindowMode,
  );

  switch (result.type) {
    case "accepted": {
      const activeEntry = getActiveEntry(room.round);
      io.to(room.roomId).emit("buzz_order_updated", {
        roundId: room.round.roundId,
        buzzOrder: room.round.buzzOrder.map(toBuzzEntryView),
        activePlayerId: activeEntry?.playerId ?? null,
      });

      // This buzz may have put someone new at the front -- the first buzz of
      // the round always does, and under free buzz a late one with an earlier
      // adjustedTime can too. Clients gate the vote panel on the tally naming
      // someone, so without this nobody could ever vote: the panel would wait
      // for a tally that only a vote would produce.
      if (room.settings.audienceVoting) {
        io.to(room.roomId).emit("vote_tally", {
          tally: toVoteTally(room.round),
        });
      }
      console.log(
        `[buzz] "${player.name}" rank ${result.entry.rank} ` +
          `adjustedTime=${result.entry.adjustedTime} ` +
          `arrival=${result.entry.serverArrivalTime} ` +
          `drift=${result.entry.serverArrivalTime - result.entry.adjustedTime}ms ` +
          `nearTie=${result.entry.nearTie} ` +
          `in ${room.roomCode}`,
      );
      break;
    }

    case "already_buzzed": {
      socket.emit("server_error", {
        code: "ALREADY_BUZZED",
        message: "You have already buzzed in for this round.",
      });
      break;
    }

    case "locked_out": {
      socket.emit("server_error", {
        code: "INVALID_STATE",
        message: `Still locked out for ${result.remainingMs}ms.`,
      });
      break;
    }

    case "penalty_applied": {
      socket.emit("early_buzz_penalty", {
        lockedForMs: result.lockedForMs,
        offenseCount: result.offenseCount,
      });
      console.log(
        `[buzz] early-buzz penalty for "${player.name}" in ${room.roomCode} ` +
          `(offense #${result.offenseCount}, locked ${result.lockedForMs}ms)`,
      );
      break;
    }

    case "round_closed": {
      socket.emit("server_error", {
        code: "INVALID_STATE",
        message: "The buzz window is closed.",
      });
      break;
    }
  }
}
