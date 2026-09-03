import { randomBytes } from "node:crypto";

// Characters that are visually unambiguous across fonts and handwriting.
// Deliberately excludes: 0 (vs O), 1 (vs I vs l), O, I, L.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 characters
const CODE_LENGTH = 6;

// 31^6 ≈ 887 million combinations — more than enough for casual use.
// The slight modulo bias from 256 % 31 = 8 is negligible here; this is
// not a cryptographic token. If we ever needed unbiased output we'd use
// rejection sampling, but that's overkill for a room code.
export function generateRoomCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]!).join("");
}
