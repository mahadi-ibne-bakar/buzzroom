import type { AdvanceQueuePayload } from "@buzzroom/shared";
import {
  advanceQueue,
  getActiveEntry,
  toBuzzEntryView,
} from "../../rooms/round.js";
import type { RoomStore } from "../../rooms/RoomStore.js";
import { getHostRoom } from "../authHelpers.js";
import type { TypedServer, TypedSocket } from "../../socketTypes.js";

const POINTS_PER_CORRECT_ANSWER = 1;

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
      // The eliminated player's entry now has eliminated: true.
      // Broadcast the updated order — the client renders the elimination
      // visually (strikethrough, greyed out, etc.).
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

      // Award point and broadcast updated scores
      store.awardPoints(
        room.roomId,
        winnerEntry.playerId,
        POINTS_PER_CORRECT_ANSWER,
      );

      io.to(room.roomId).emit("round_resolved", {
        winnerPlayerId: winnerEntry.playerId,
        winnerName: winnerEntry.playerName,
        pointsAwarded: POINTS_PER_CORRECT_ANSWER,
      });

      io.to(room.roomId).emit("score_update", {
        players: Array.from(room.players.values()).map((p) =>
          store.toPlayerView(p),
        ),
      });

      console.log(
        `[queue] "${winnerEntry.playerName}" correct in ${room.roomCode} (+${POINTS_PER_CORRECT_ANSWER} pt)`,
      );
      break;
    }
  }

  store.bumpActivity(room.roomId);
}
