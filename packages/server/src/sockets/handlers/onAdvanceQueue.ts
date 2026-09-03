import type { AdvanceQueuePayload } from "@buzzroom/shared";
import {
  advanceQueue,
  getActiveEntry,
  toBuzzEntryView,
} from "../../rooms/round.js";
import type { RoomStore } from "../../rooms/RoomStore.js";
import { getHostRoom } from "../authHelpers.js";
import { emitScoreUpdate } from "../scoreHelpers.js";
import type { TypedServer, TypedSocket } from "../../socketTypes.js";

export function onAdvanceQueue(
  io: TypedServer,
  socket: TypedSocket,
  store: RoomStore,
  payload: AdvanceQueuePayload,
): void {
  const room = getHostRoom(socket, store);
  if (!room) return;

  if (!room.round) {
    socket.emit("server_error", {
      code: "NO_ACTIVE_ROUND",
      message: "No buzz round is currently active.",
    });
    return;
  }

  const result = advanceQueue(room.round, payload.result);

  switch (result.type) {
    case "no_active_player": {
      socket.emit("server_error", {
        code: "INVALID_STATE",
        message: "No active player to advance.",
      });
      break;
    }

    case "wrong": {
      const nextActive = getActiveEntry(room.round);
      io.to(room.roomId).emit("buzz_order_updated", {
        roundId: room.round.roundId,
        buzzOrder: room.round.buzzOrder.map(toBuzzEntryView),
        activePlayerId: nextActive?.playerId ?? null,
      });
      console.log(
        `[queue] "${result.eliminatedEntry.playerName}" wrong in ${room.roomCode}` +
          (result.nextActiveEntry
            ? `; next up: "${result.nextActiveEntry.playerName}"`
            : "; no more players"),
      );
      break;
    }

    case "correct": {
      const { winnerEntry } = result;

      // payload.points defaults to 1 (set by Zod schema) but the host
      // can specify a different value (e.g., 2 for a bonus question, 0
      // to resolve without awarding).
      store.awardPoints(room.roomId, winnerEntry.playerId, payload.points);

      io.to(room.roomId).emit("round_resolved", {
        winnerPlayerId: winnerEntry.playerId,
        winnerName: winnerEntry.playerName,
        pointsAwarded: payload.points,
      });

      // emitScoreUpdate computes the leaderboard and broadcasts score_update.
      emitScoreUpdate(io, room, store);

      console.log(
        `[queue] "${winnerEntry.playerName}" correct in ${room.roomCode} ` +
          `(+${payload.points} pt)`,
      );
      break;
    }
  }

  store.bumpActivity(room.roomId);
}
