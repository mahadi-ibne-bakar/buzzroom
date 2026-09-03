import { describe, expect, it } from "vitest";
import { parseRoomCodeFromSearch } from "../lib/joinLink.js";

// The QR code on the host's screen encodes /?room=ABCDEF, so whatever a
// phone's camera hands back has to survive this before it can pre-fill the
// join form.

describe("parseRoomCodeFromSearch", () => {
  it("reads a well-formed code", () => {
    expect(parseRoomCodeFromSearch("?room=ABCDEF")).toBe("ABCDEF");
  });

  it("upper-cases a lowercased link", () => {
    expect(parseRoomCodeFromSearch("?room=abcdef")).toBe("ABCDEF");
  });

  it("ignores other query parameters", () => {
    expect(parseRoomCodeFromSearch("?utm=x&room=ABCDEF&y=1")).toBe("ABCDEF");
  });

  it("returns empty when there is no room parameter", () => {
    expect(parseRoomCodeFromSearch("?other=1")).toBe("");
    expect(parseRoomCodeFromSearch("")).toBe("");
  });

  it("rejects a code of the wrong length rather than half-filling the form", () => {
    expect(parseRoomCodeFromSearch("?room=ABC")).toBe("");
    expect(parseRoomCodeFromSearch("?room=ABCDEFGH")).toBe("");
  });

  it("strips punctuation a scanner or messaging app may have appended", () => {
    expect(parseRoomCodeFromSearch("?room=ABC-DEF")).toBe("ABCDEF");
    expect(parseRoomCodeFromSearch("?room=ABCDEF.")).toBe("ABCDEF");
  });
});
