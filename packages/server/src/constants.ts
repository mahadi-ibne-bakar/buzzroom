export const MAX_PLAYERS = 20;
export const MAX_NAME_LENGTH = 20;

export const ROOM_CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
export const ROOM_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

// ── Fairness engine (Phase 5) ─────────────────────────────────────────────

// Buzzes whose adjustedTimes fall within this window of each other are
// flagged as a near-tie. The host sees this and can use their judgment
// rather than trusting a ranking that may be within the margin of error.
export const NEAR_TIE_THRESHOLD_MS = 50;

// Maximum allowed spread between a client's claimed adjustedTime and the
// server's current clock. Clamps timestamp manipulation: a player who
// backdates their buzz by more than this still gets clamped to the floor.
export const MAX_CLOCK_SKEW_MS = 2_000;

// ── Buzz-in modes (Phase 8) ───────────────────────────────────────────────

// The pattern buzzer draws a 3x3 grid, so dot indices run 0-8. Sequences are
// PATTERN_MIN_LENGTH..PATTERN_MAX_LENGTH dots long -- long enough to be a
// real gesture, short enough that nobody is fumbling while the round runs.
// These bounds must stay inside the range BuzzPayloadSchema accepts (3-9).
export const PATTERN_DOT_COUNT = 9;
export const PATTERN_MIN_LENGTH = 4;
export const PATTERN_MAX_LENGTH = 6;

// ── Connection quality ────────────────────────────────────────────────────

// Most a room will fan out ping_update. Each player syncs on their own
// heartbeat, so without coalescing a full room would broadcast several times
// a second to show a number that changes by a few milliseconds.
export const PING_BROADCAST_INTERVAL_MS = 2_000;
