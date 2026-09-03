/**
 * Pulls a room code out of a location query string.
 *
 * The host's QR code encodes `/?room=ABCDEF` so a phone's built-in camera can
 * open the app with the room already chosen. Anything that isn't a clean
 * six-character code comes back empty, so a mangled link drops the player on
 * the normal join form rather than pre-filling it with junk.
 */
export function parseRoomCodeFromSearch(search: string): string {
  const raw = new URLSearchParams(search).get("room") ?? "";
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned.length === 6 ? cleaned : "";
}
