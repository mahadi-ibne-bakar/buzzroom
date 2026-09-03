import { z } from "zod";

// Why Zod here, not just TypeScript types?
// TypeScript types are erased at runtime. A malicious (or buggy) client
// can send any JSON it wants over the socket. Zod validates the actual
// runtime values, and the TypeScript types are automatically derived from
// the same schema — so there's only one place to update if a payload shape
// changes.

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
