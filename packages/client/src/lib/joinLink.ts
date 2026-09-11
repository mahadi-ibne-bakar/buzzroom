/**
 * Pulls a six-character room code out of a location query string.
 *
 * Anything that isn't a clean six-character code comes back empty, so a
 * mangled link falls back to normal behaviour rather than half-filling a form
 * or trying to attach to a room that doesn't exist.
 */
function parseCode(search: string, key: string): string {
  const raw = new URLSearchParams(search).get(key) ?? "";
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned.length === 6 ? cleaned : "";
}

/**
 * `/?room=ABCDEF` — the host's QR code, so a phone's built-in camera opens
 * the app with the room already chosen.
 */
export function parseRoomCodeFromSearch(search: string): string {
  return parseCode(search, "room");
}

/**
 * `/?present=ABCDEF` — the big-screen view (spec §13). A separate parameter
 * rather than a flag on `room=` so a scanned join link can never accidentally
 * turn a player's phone into a presenter.
 */
export function parsePresentCodeFromSearch(search: string): string {
  return parseCode(search, "present");
}
