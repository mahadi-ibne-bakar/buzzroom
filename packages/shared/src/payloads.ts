import { z } from "zod";

// Why Zod here, not just TypeScript types?
// TypeScript types are erased at runtime. A malicious (or buggy) client
// can send any JSON it wants over the socket. Zod validates the actual
// runtime values, and the TypeScript types are automatically derived from
// the same schema — so there's only one place to update if a payload
// shape changes.

// ── Phase 3: room lifecycle ───────────────────────────────────────────────

export const CreateRoomPayloadSchema = z.object({
  hostName: z.string().min(1).max(20),
});
export type CreateRoomPayload = z.infer<typeof CreateRoomPayloadSchema>;

export const JoinRoomPayloadSchema = z.object({
  roomCode: z
    .string()
    .length(6)
    .transform((s) => s.toUpperCase()),
  playerName: z.string().min(1).max(20),
});
export type JoinRoomPayload = z.infer<typeof JoinRoomPayloadSchema>;

// ── Phase 4: buzz round lifecycle ─────────────────────────────────────────

export const OpenBuzzPayloadSchema = z.object({
  buzzMode: z.enum(["button"]),
});
export type OpenBuzzPayload = z.infer<typeof OpenBuzzPayloadSchema>;

export const AdvanceQueuePayloadSchema = z.object({
  result: z.enum(["correct", "wrong"]),
});
export type AdvanceQueuePayload = z.infer<typeof AdvanceQueuePayloadSchema>;

// ── Phase 5: fairness engine ──────────────────────────────────────────────

// Ping sent by the client on a ~2s heartbeat to keep its clock-offset
// estimate fresh. The server echoes t0 back in sync_pong so the client
// can compute RTT = (receiveTime - t0).
export const SyncPingPayloadSchema = z.object({
  t0: z.number().int().positive(), // client local time in ms (Date.now())
});
export type SyncPingPayload = z.infer<typeof SyncPingPayloadSchema>;

// Buzz payload now carries both the raw local timestamp and the
// client's latency-adjusted estimate. The server ranks by adjustedTime;
// it keeps localTime for debugging and audit trails.
export const BuzzPayloadSchema = z.object({
  mode: z.enum(["button"]),
  localTime: z.number().int().positive(), // raw client clock at press
  adjustedTime: z.number().int().positive(), // localTime + clientClockOffset
});
export type BuzzPayload = z.infer<typeof BuzzPayloadSchema>;
