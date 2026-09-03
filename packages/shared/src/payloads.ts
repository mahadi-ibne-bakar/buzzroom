import { z } from "zod";

// Why Zod here, not just TypeScript types?
// TypeScript types are erased at runtime. A malicious (or buggy) client
// can send any JSON it wants over the socket. Zod validates the actual
// runtime values, and the TypeScript types are automatically derived from
// the same schema — so there's only one place to update if a payload shape
// changes.

// ---------- Phase 3: room lifecycle ----------

export const CreateRoomPayloadSchema = z.object({
  hostName: z.string().min(1).max(20),
});
export type CreateRoomPayload = z.infer<typeof CreateRoomPayloadSchema>;

export const JoinRoomPayloadSchema = z.object({
  // Room codes are always 6 uppercase alphanumeric characters.
  // We uppercase() here so that clients that accidentally lowercase
  // the code (e.g. from a QR scanner that normalises output) still work.
  roomCode: z
    .string()
    .length(6)
    .transform((s) => s.toUpperCase()),
  playerName: z.string().min(1).max(20),
});
export type JoinRoomPayload = z.infer<typeof JoinRoomPayloadSchema>;

// ---------- Phase 4: buzz round lifecycle ----------

export const OpenBuzzPayloadSchema = z.object({
  // Only "button" exists now; "slide" and "pattern" come in Phase 8.
  // Defining this as an enum now means adding new modes is a non-breaking
  // change — clients that only know about "button" just ignore new values.
  buzzMode: z.enum(["button"]),
});
export type OpenBuzzPayload = z.infer<typeof OpenBuzzPayloadSchema>;

export const BuzzPayloadSchema = z.object({
  mode: z.enum(["button"]),
});
export type BuzzPayload = z.infer<typeof BuzzPayloadSchema>;

export const AdvanceQueuePayloadSchema = z.object({
  result: z.enum(["correct", "wrong"]),
});
export type AdvanceQueuePayload = z.infer<typeof AdvanceQueuePayloadSchema>;
