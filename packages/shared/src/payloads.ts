import { z } from "zod";

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
  // How many points to award on a correct answer.
  // Optional with a default of 1 — omitting it is the same as Phase 4 behaviour.
  // Allows 0 (resolve the question correctly but award no points).
  points: z.number().int().min(0).max(100).default(1),
});
export type AdvanceQueuePayload = z.infer<typeof AdvanceQueuePayloadSchema>;

// ── Phase 5: fairness engine ──────────────────────────────────────────────

export const SyncPingPayloadSchema = z.object({
  t0: z.number().int().positive(),
});
export type SyncPingPayload = z.infer<typeof SyncPingPayloadSchema>;

export const BuzzPayloadSchema = z.object({
  mode: z.enum(["button"]),
  localTime: z.number().int().positive(),
  adjustedTime: z.number().int().positive(),
});
export type BuzzPayload = z.infer<typeof BuzzPayloadSchema>;

// ── Phase 6: scoring ──────────────────────────────────────────────────────

export const AwardPointsPayloadSchema = z.object({
  playerId: z.string().uuid(),
  // Positive to award, negative to deduct. Zero is rejected — a delta of 0
  // is always a no-op and most likely a client bug.
  delta: z
    .number()
    .int()
    .min(-100)
    .max(100)
    .refine((d) => d !== 0, { message: "delta must be non-zero" }),
});
export type AwardPointsPayload = z.infer<typeof AwardPointsPayloadSchema>;
