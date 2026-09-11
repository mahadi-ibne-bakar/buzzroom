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
  // Spec section 11 carries the window mode on open_buzz. Optional: omitting
  // it leaves the room on whatever mode it is already set to.
  buzzWindowMode: z.enum(["free", "locked"]).optional(),
});
export type OpenBuzzPayload = z.infer<typeof OpenBuzzPayloadSchema>;

export const AdvanceQueuePayloadSchema = z.object({
  result: z.enum(["correct", "wrong"]),
  points: z.number().int().min(0).max(100).default(1),
});
export type AdvanceQueuePayload = z.infer<typeof AdvanceQueuePayloadSchema>;

export const SyncPingPayloadSchema = z.object({
  t0: z.number().int().positive(),
  // Round-trip time the client measured on its previous sync, piggybacked so
  // the host can show a connection-quality indicator per player (spec
  // section 4). Absent on the very first ping, before there is one to report.
  lastRtt: z.number().int().min(0).max(60_000).optional(),
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

export const CreateTeamPayloadSchema = z.object({
  name: z.string().min(1).max(20),
});
export type CreateTeamPayload = z.infer<typeof CreateTeamPayloadSchema>;

export const DeleteTeamPayloadSchema = z.object({
  teamId: z.string().uuid(),
});
export type DeleteTeamPayload = z.infer<typeof DeleteTeamPayloadSchema>;

// teamId null moves the player back out of every team.
export const AssignTeamPayloadSchema = z.object({
  playerId: z.string().uuid(),
  teamId: z.string().uuid().nullable(),
});
export type AssignTeamPayload = z.infer<typeof AssignTeamPayloadSchema>;

// A presenter screen watches a room without taking a seat in it: no name, no
// player record, no place in the leaderboard.
export const WatchRoomPayloadSchema = z.object({
  roomCode: z
    .string()
    .length(6)
    .transform((s) => s.toUpperCase()),
});
export type WatchRoomPayload = z.infer<typeof WatchRoomPayloadSchema>;

export const ReconnectRoomPayloadSchema = z.object({
  playerId: z.string().uuid(),
  roomCode: z
    .string()
    .length(6)
    .transform((s) => s.toUpperCase()),
});
export type ReconnectRoomPayload = z.infer<typeof ReconnectRoomPayloadSchema>;

// Both fields optional: a settings update is a patch, and the host UI toggles
// one control at a time.
export const UpdateSettingsPayloadSchema = z
  .object({
    buzzWindowMode: z.enum(["free", "locked"]).optional(),
    earlyBuzzPenalty: z.boolean().optional(),
    teamsEnabled: z.boolean().optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    message: "at least one setting must be provided",
  });
export type UpdateSettingsPayload = z.infer<typeof UpdateSettingsPayloadSchema>;
