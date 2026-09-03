import type { BuzzPayload, ModeParams } from "@buzzroom/shared";

/**
 * Builds the buzz payload for the round's current input mode.
 *
 * adjustedTime is rounded because the wire protocol declares both timestamps
 * as integer milliseconds (BuzzPayloadSchema uses z.number().int()), while the
 * clock offset is fractional -- it comes out of `ts - (t0 + rtt / 2)`, which
 * ends in .5 whenever the round-trip time is an odd number of milliseconds.
 * Sending the raw sum failed validation on roughly half of all buzzes, and the
 * player just saw "Invalid payload." Rounding costs nothing: sub-millisecond
 * precision is three orders of magnitude below the 50ms near-tie threshold the
 * fairness engine actually resolves at.
 */
export function buildBuzzPayload(
  modeParams: ModeParams,
  localTime: number,
  clockOffset: number,
): BuzzPayload {
  const adjustedTime = Math.round(localTime + clockOffset);

  switch (modeParams.mode) {
    case "button":
      return { mode: "button", localTime, adjustedTime };

    case "slide":
      return {
        mode: "slide",
        token: modeParams.token,
        localTime,
        adjustedTime,
      };

    case "pattern":
      return {
        mode: "pattern",
        token: modeParams.token,
        sequence: modeParams.sequence,
        localTime,
        adjustedTime,
      };
  }
}
