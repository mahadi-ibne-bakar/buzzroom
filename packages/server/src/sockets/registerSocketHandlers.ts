import {
  AdvanceQueuePayloadSchema,
  AwardPointsPayloadSchema,
  BuzzPayloadSchema,
  CreateRoomPayloadSchema,
  JoinRoomPayloadSchema,
  OpenBuzzPayloadSchema,
  ReconnectRoomPayloadSchema,
  SyncPingPayloadSchema,
} from "@buzzroom/shared";
import type { RoomStore } from "../rooms/RoomStore.js";
import type { TypedServer } from "../socketTypes.js";
import { onAdvanceQueue } from "./handlers/onAdvanceQueue.js";
import { onAwardPoints } from "./handlers/onAwardPoints.js";
import { onBuzz } from "./handlers/onBuzz.js";
import { onCloseBuzz } from "./handlers/onCloseBuzz.js";
import { onCreateRoom } from "./handlers/onCreateRoom.js";
import { onDisconnect } from "./handlers/onDisconnect.js";
import { onJoinRoom } from "./handlers/onJoinRoom.js";
import { onOpenBuzz } from "./handlers/onOpenBuzz.js";
import { onReconnect } from "./handlers/onReconnect.js";
import { onResetRound } from "./handlers/onResetRound.js";
import { onSyncPing } from "./handlers/onSyncPing.js";
import { SocketRateLimiter } from "./rateLimiter.js";

export function registerSocketHandlers(
  io: TypedServer,
  store: RoomStore,
): void {
  io.on("connection", (socket) => {
    console.log(`socket connected: ${socket.id}`);

    const limiter = new SocketRateLimiter();

    // ── Helpers ───────────────────────────────────────────────────────────

    function rateCheck(event: string, max: number, windowMs = 60_000): boolean {
      if (!limiter.check(event, max, windowMs)) {
        socket.emit("server_error", {
          code: "RATE_LIMITED",
          message: "Too many requests. Please wait before trying again.",
        });
        return false;
      }
      return true;
    }

    function validate<T>(
      schema: {
        safeParse: (
          v: unknown,
        ) => { success: true; data: T } | { success: false };
      },
      payload: unknown,
    ): T | null {
      const result = schema.safeParse(payload);
      if (!result.success) {
        socket.emit("server_error", {
          code: "VALIDATION_ERROR",
          message: "Invalid payload.",
        });
        return null;
      }
      return result.data;
    }

    // ── Phase 3: room lifecycle ───────────────────────────────────────────

    socket.on("create_room", (payload) => {
      if (!rateCheck("create_room", 3)) return;
      const data = validate(CreateRoomPayloadSchema, payload);
      if (!data) return;
      onCreateRoom(io, socket, store, data);
    });

    socket.on("join_room", (payload) => {
      if (!rateCheck("join_room", 10)) return;
      const data = validate(JoinRoomPayloadSchema, payload);
      if (!data) return;
      onJoinRoom(io, socket, store, data);
    });

    // Reconnects are more frequent than joins -- a flaky phone can drop and
    // come back several times a round -- so the budget is more generous.
    socket.on("reconnect_room", (payload) => {
      if (!rateCheck("reconnect_room", 20)) return;
      const data = validate(ReconnectRoomPayloadSchema, payload);
      if (!data) return;
      onReconnect(io, socket, store, data);
    });

    // ── Phase 4: buzz round lifecycle ─────────────────────────────────────

    socket.on("open_buzz", (payload) => {
      if (!rateCheck("open_buzz", 60)) return;
      const data = validate(OpenBuzzPayloadSchema, payload);
      if (!data) return;
      onOpenBuzz(io, socket, store, data);
    });

    socket.on("close_buzz", () => {
      if (!rateCheck("close_buzz", 60)) return;
      onCloseBuzz(io, socket, store);
    });

    socket.on("reset_round", () => {
      if (!rateCheck("reset_round", 60)) return;
      onResetRound(io, socket, store);
    });

    socket.on("buzz", (payload) => {
      if (!rateCheck("buzz", 30)) return;
      const data = validate(BuzzPayloadSchema, payload);
      if (!data) return;
      onBuzz(io, socket, store, data);
    });

    socket.on("advance_queue", (payload) => {
      if (!rateCheck("advance_queue", 60)) return;
      const data = validate(AdvanceQueuePayloadSchema, payload);
      if (!data) return;
      onAdvanceQueue(io, socket, store, data);
    });

    // ── Phase 5: clock sync ───────────────────────────────────────────────

    socket.on("sync_ping", (payload) => {
      if (!rateCheck("sync_ping", 60)) return;
      const data = validate(SyncPingPayloadSchema, payload);
      if (!data) return;
      onSyncPing(socket, store, data);
    });

    // ── Phase 6: scoring ──────────────────────────────────────────────────

    socket.on("award_points", (payload) => {
      if (!rateCheck("award_points", 60)) return;
      const data = validate(AwardPointsPayloadSchema, payload);
      if (!data) return;
      onAwardPoints(io, socket, store, data);
    });

    // ── Disconnect ────────────────────────────────────────────────────────

    socket.on("disconnect", (reason) => {
      console.log(`socket disconnected: ${socket.id} (${reason})`);
      onDisconnect(io, socket, store);
    });
  });
}
