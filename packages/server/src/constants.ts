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
