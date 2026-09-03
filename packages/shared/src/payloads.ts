import { z } from "zod";

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

export const OpenBuzzPayloadSchema = z.object({
  buzzMode: z.enum(["button", "slide", "pattern"]),
});
export type OpenBuzzPayload = z.infer<typeof OpenBuzzPayloadSchema>;

export const AdvanceQueuePayloadSchema = z.object({
  result: z.enum(["correct", "wrong"]),
  points: z.number().int().min(0).max(100).default(1),
});
export type AdvanceQueuePayload = z.infer<typeof AdvanceQueuePayloadSchema>;

export const SyncPingPayloadSchema = z.object({
  t0: z.number().int().positive(),
});
export type SyncPingPayload = z.infer<typeof SyncPingPayloadSchema>;

// Phase 8: discriminated union so each mode carries exactly the fields it needs.
// button: no extra fields
// slide:  token (must match round's modeParams.token)
// pattern: token + sequence (must match round's modeParams.sequence)
const baseBuzz = {
  localTime: z.number().int().positive(),
  adjustedTime: z.number().int().positive(),
};
export const BuzzPayloadSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("button"), ...baseBuzz }),
  z.object({ mode: z.literal("slide"), token: z.string().min(1), ...baseBuzz }),
  z.object({
    mode: z.literal("pattern"),
    token: z.string().min(1),
    sequence: z.array(z.number().int().min(0).max(8)).min(3).max(9),
    ...baseBuzz,
  }),
]);
export type BuzzPayload = z.infer<typeof BuzzPayloadSchema>;

export const AwardPointsPayloadSchema = z.object({
  playerId: z.string().uuid(),
  delta: z
    .number()
    .int()
    .min(-100)
    .max(100)
    .refine((d) => d !== 0, {
      message: "delta must be non-zero",
    }),
});
export type AwardPointsPayload = z.infer<typeof AwardPointsPayloadSchema>;

export const ReconnectRoomPayloadSchema = z.object({
  playerId: z.string().uuid(),
  roomCode: z
    .string()
    .length(6)
    .transform((s) => s.toUpperCase()),
});
export type ReconnectRoomPayload = z.infer<typeof ReconnectRoomPayloadSchema>;
