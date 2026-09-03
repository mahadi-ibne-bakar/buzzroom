import type {
  CreateRoomPayload,
  JoinRoomPayload,
  OpenBuzzPayload,
  BuzzPayload,
  AdvanceQueuePayload,
} from "./payloads.js";
import type { BuzzEntryView, PlayerView, RoomView } from "./types.js";

// ---------- Server → Client payloads ----------

export interface RoomCreatedPayload {
  room: RoomView;
  yourPlayerId: string;
}

export interface JoinOkPayload {
  room: RoomView;
  yourPlayerId: string;
}

export interface PlayerJoinedPayload {
  player: PlayerView;
}

export interface PlayerLeftPayload {
  playerId: string;
  playerName: string;
}

export interface RoundOpenedPayload {
  round: RoundView; // full round state including mode
}

// Sent to ALL players whenever the buzz order changes (new buzz, or
// a player gets eliminated). The client always gets the full list so
// it never needs to do partial updates.
export interface BuzzOrderUpdatedPayload {
  roundId: string;
  buzzOrder: BuzzEntryView[];
  activePlayerId: string | null;
}

// Sent only to the offending player's socket.
export interface EarlyBuzzPenaltyPayload {
  lockedForMs: number;
  offenseCount: number; // 1-based, so client can escalate feedback
}

export interface RoundResolvedPayload {
  winnerPlayerId: string;
  winnerName: string;
  pointsAwarded: number;
}

// Sent after any score change (correct answer, or future manual award).
export interface ScoreUpdatePayload {
  players: PlayerView[];
}

export interface ServerErrorPayload {
  // Machine-readable code the client can switch on, plus a human-readable
  // message for display or logging.
  code:
    | "VALIDATION_ERROR"
    | "RATE_LIMITED"
    | "ROOM_NOT_FOUND"
    | "ROOM_FULL"
    | "NAME_TAKEN"
    | "NAME_INVALID"
    | "UNAUTHORIZED"
    | "INVALID_STATE"
    | "NO_ACTIVE_ROUND"
    | "ALREADY_BUZZED";
  message: string;
}

// Re-export so callers don't need a separate import
export type { RoundView } from "./types.js";

// ---------- Socket.io event maps ----------
// These drive TypeScript's autocomplete and type-checking for socket.on()
// and socket.emit() calls on both sides of the connection.

export interface ServerToClientEvents {
  // Room lifecycle (Phase 3)
  room_created: (payload: RoomCreatedPayload) => void;
  join_ok: (payload: JoinOkPayload) => void;
  player_joined: (payload: PlayerJoinedPayload) => void;
  player_left: (payload: PlayerLeftPayload) => void;

  // Buzz round lifecycle (Phase 4)
  round_opened: (payload: RoundOpenedPayload) => void;
  round_closed: () => void;
  round_reset: () => void;
  buzz_order_updated: (payload: BuzzOrderUpdatedPayload) => void;
  early_buzz_penalty: (payload: EarlyBuzzPenaltyPayload) => void;
  round_resolved: (payload: RoundResolvedPayload) => void;
  score_update: (payload: ScoreUpdatePayload) => void;

  // Errors
  server_error: (payload: ServerErrorPayload) => void;
}

export interface ClientToServerEvents {
  // Room lifecycle (Phase 3)
  create_room: (payload: CreateRoomPayload) => void;
  join_room: (payload: JoinRoomPayload) => void;

  // Buzz round lifecycle (Phase 4)
  open_buzz: (payload: OpenBuzzPayload) => void;
  close_buzz: () => void;
  reset_round: () => void;
  buzz: (payload: BuzzPayload) => void;
  advance_queue: (payload: AdvanceQueuePayload) => void;
}
