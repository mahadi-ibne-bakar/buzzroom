import { describe, expect, it } from "vitest";
import { generateRoomCode } from "../rooms/generateRoomCode.js";

const VALID_CHARS = new Set("ABCDEFGHJKMNPQRSTUVWXYZ23456789");

describe("generateRoomCode", () => {
  it("produces a 6-character string", () => {
    expect(generateRoomCode()).toHaveLength(6);
  });

  it("uses only the unambiguous alphabet", () => {
    // Run enough iterations to exercise the full character distribution
    for (let i = 0; i < 200; i++) {
      for (const char of generateRoomCode()) {
        expect(VALID_CHARS.has(char), `unexpected char: ${char}`).toBe(true);
      }
    }
  });

  it("produces different codes on successive calls", () => {
    const codes = new Set(Array.from({ length: 50 }, generateRoomCode));
    // 50 calls should never collide — with 887M combinations the
    // probability is negligible
    expect(codes.size).toBe(50);
  });
});
