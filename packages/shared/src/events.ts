import type {
  AdvanceQueuePayload,
  AwardPointsPayload,
  BuzzPayload,
  CreateRoomPayload,
  JoinRoomPayload,
  OpenBuzzPayload,
  SyncPingPayload,
} from "./payloads.js";
import type {
  BuzzEntryView,
  LeaderboardEntry,
  PlayerView,
  RoomView,
  RoundView,
} from "./types.js";

// ── Server → Client payloads ──────────────────────────────────────────────

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
  round: RoundView;
}

export interface BuzzOrderUpdatedPayload {
  roundId: string;
  buzzOrder: BuzzEntryView[];
  activePlayerId: string | null;
}

export interface EarlyBuzzPenaltyPayload {
  lockedForMs: number;
  offenseCount: number;
}

export interface RoundResolvedPayload {
  winnerPlayerId: string;
  winnerName: string;
  pointsAwarded: number;
}

// Updated in Phase 6: now includes a pre-sorted, ranked leaderboard in
// addition to the raw player list. Clients should prefer leaderboard for
// display — it handles tie ranking correctly and is already sorted.
export interface ScoreUpdatePayload {
  players: PlayerView[]; // raw player data (unchanged)
  leaderboard: LeaderboardEntry[]; // sorted by score, with ranks and tie flags
}

export interface SyncPongPayload {
  t0: number;
  ts: number;
}

export interface ServerErrorPayload {
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

export type { RoundView } from "./types.js";

// ── Socket.io event maps ──────────────────────────────────────────────────

export interface ServerToClientEvents {
  room_created: (payload: RoomCreatedPayload) => void;
  join_ok: (payload: JoinOkPayload) => void;
  player_joined: (payload: PlayerJoinedPayload) => void;
  player_left: (payload: PlayerLeftPayload) => void;
  round_opened: (payload: RoundOpenedPayload) => void;
  round_closed: () => void;
  round_reset: () => void;
  buzz_order_updated: (payload: BuzzOrderUpdatedPayload) => void;
  early_buzz_penalty: (payload: EarlyBuzzPenaltyPayload) => void;
  round_resolved: (payload: RoundResolvedPayload) => void;
  score_update: (payload: ScoreUpdatePayload) => void;
  sync_pong: (payload: SyncPongPayload) => void;
  server_error: (payload: ServerErrorPayload) => void;
}

export interface ClientToServerEvents {
  create_room: (payload: CreateRoomPayload) => void;
  join_room: (payload: JoinRoomPayload) => void;
  open_buzz: (payload: OpenBuzzPayload) => void;
  close_buzz: () => void;
  reset_round: () => void;
  buzz: (payload: BuzzPayload) => void;
  advance_queue: (payload: AdvanceQueuePayload) => void;
  sync_ping: (payload: SyncPingPayload) => void;
  award_points: (payload: AwardPointsPayload) => void; // Phase 6
}
