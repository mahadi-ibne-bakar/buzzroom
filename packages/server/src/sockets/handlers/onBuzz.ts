import type { BuzzPayload } from "@buzzroom/shared";
import { processBuzz, getActiveEntry, toBuzzEntryView } from "../../rooms/round.js";
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
    socket.emit("server_error", {
      code: "NO_ACTIVE_ROUND",
      message: "No buzz round is currently active.",
    });
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
  );

  switch (result.type) {
    case "accepted": {
      const activeEntry = getActiveEntry(room.round);
      io.to(room.roomId).emit("buzz_order_updated", {
        roundId: room.round.roundId,
        buzzOrder: room.round.buzzOrder.map(toBuzzEntryView),
        activePlayerId: activeEntry?.playerId ?? null,
      });
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
