import type { BuzzPayload } from "@buzzroom/shared";
import {
  processBuzz,
  getActiveEntry,
  toBuzzEntryView,
} from "../../rooms/round.js";
import type { RoomStore } from "../../rooms/RoomStore.js";
import type { TypedServer, TypedSocket } from "../../socketTypes.js";

export function onBuzz(
  io: TypedServer,
  socket: TypedSocket,
  store: RoomStore,
  _payload: BuzzPayload, // mode field will matter in Phase 8
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
  const result = processBuzz(
    room.round,
    player.playerId,
    player.name,
    serverTime,
    room.settings.earlyBuzzPenalty,
  );

  switch (result.type) {
    case "accepted": {
      // Broadcast the updated buzz order to every player in the room,
      // including the buzzer — they need their rank visible on screen.
      const activeEntry = getActiveEntry(room.round);
      io.to(room.roomId).emit("buzz_order_updated", {
        roundId: room.round.roundId,
        buzzOrder: room.round.buzzOrder.map(toBuzzEntryView),
        activePlayerId: activeEntry?.playerId ?? null,
      });
      console.log(
        `[buzz] "${player.name}" rank ${result.entry.rank} in ${room.roomCode}`,
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
      // Still locked from a previous penalty — reject silently with timing info
      socket.emit("server_error", {
        code: "INVALID_STATE",
        message: `Still locked out for ${result.remainingMs}ms.`,
      });
      break;
    }

    case "penalty_applied": {
      // Only the offending player sees the penalty event; everyone else
      // is unaware. The UI shakes/vibrates the buzzer button.
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
      // Round is closed and penalty is disabled — silent rejection
      socket.emit("server_error", {
        code: "INVALID_STATE",
        message: "The buzz window is closed.",
      });
      break;
    }
  }
}
