export const MAX_PLAYERS = 20;
export const MAX_NAME_LENGTH = 20;

// How often the cleanup job runs, and how long a room must be idle
// before it's considered stale and eligible for removal.
export const ROOM_CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
export const ROOM_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
