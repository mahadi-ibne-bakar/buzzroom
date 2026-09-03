import { MAX_NAME_LENGTH } from "../constants.js";

/**
 * Sanitizes a display name coming from an untrusted client.
 *
 * What it does:
 *  - Strips anything that looks like an HTML tag (<script>, <b>, etc.)
 *  - Trims leading/trailing whitespace
 *  - Enforces the maximum length cap
 *
 * What it does NOT do:
 *  - Escape HTML entities like &amp; — these are harmless in a JSON
 *    context and React escapes them automatically when rendering.
 *
 * Returns an empty string if nothing valid is left after sanitization,
 * which callers should treat as a NAME_INVALID error.
 */
export function sanitizeName(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "") // strip HTML tags
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}
