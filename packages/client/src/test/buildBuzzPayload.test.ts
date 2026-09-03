import { describe, expect, it } from "vitest";
import { BuzzPayloadSchema } from "@buzzroom/shared";
import { buildBuzzPayload } from "../lib/buildBuzzPayload.js";

// Every case is checked against the real schema the server validates with.
// A payload the client can build but the server rejects is the bug this
// suite exists to catch: the clock offset is fractional (ts - (t0 + rtt/2)),
// so an unrounded adjustedTime failed z.number().int() on any odd RTT and
// the buzz came back as "Invalid payload."

describe("buildBuzzPayload", () => {
  const localTime = 1_700_000_000_000;

  it("rounds a fractional clock offset into an integer adjustedTime", () => {
    const payload = buildBuzzPayload({ mode: "button" }, localTime, -0.5);
    expect(Number.isInteger(payload.adjustedTime)).toBe(true);
  });

  it("keeps localTime untouched", () => {
    const payload = buildBuzzPayload({ mode: "button" }, localTime, 12.5);
    expect(payload.localTime).toBe(localTime);
  });

  it.each([-0.5, 0, 0.5, -1.25, 7.75, 123.5, -4321.5])(
    "produces a schema-valid button payload at offset %p",
    (offset) => {
      const payload = buildBuzzPayload({ mode: "button" }, localTime, offset);
      expect(BuzzPayloadSchema.safeParse(payload).success).toBe(true);
    },
  );

  it("carries the round's token on a slide payload", () => {
    const payload = buildBuzzPayload(
      { mode: "slide", token: "tok-123" },
      localTime,
      -0.5,
    );
    expect(BuzzPayloadSchema.safeParse(payload).success).toBe(true);
    expect(payload).toMatchObject({ mode: "slide", token: "tok-123" });
  });

  it("carries the round's token and sequence on a pattern payload", () => {
    const sequence = [4, 0, 8, 2];
    const payload = buildBuzzPayload(
      { mode: "pattern", token: "tok-456", sequence },
      localTime,
      0.5,
    );
    expect(BuzzPayloadSchema.safeParse(payload).success).toBe(true);
    expect(payload).toMatchObject({
      mode: "pattern",
      token: "tok-456",
      sequence,
    });
  });
});
