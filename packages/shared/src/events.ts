import type {
  AdvanceQueuePayload,
  BuzzPayload,
  CreateRoomPayload,
  JoinRoomPayload,
  OpenBuzzPayload,
  SyncPingPayload,
} from "./payloads.js";
import type { BuzzEntryView, PlayerView, RoomView, RoundView } from "./types.js";

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

export interface ScoreUpdatePayload {
  players: PlayerView[];
}

// Phase 5: the server echoes the client's t0 and adds its own clock
// reading so the client can compute: RTT = t1 - t0, offset = ts - (t0 + RTT/2)
export interface SyncPongPayload {
  t0: number; // echoed client timestamp
  ts: number; // server clock at moment of processing the ping
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
  // Room lifecycle
  room_created: (payload: RoomCreatedPayload) => void;
  join_ok: (payload: JoinOkPayload) => void;
  player_joined: (payload: PlayerJoinedPayload) => void;
  player_left: (payload: PlayerLeftPayload) => void;

  // Buzz round
  round_opened: (payload: RoundOpenedPayload) => void;
  round_closed: () => void;
  round_reset: () => void;
  buzz_order_updated: (payload: BuzzOrderUpdatedPayload) => void;
  early_buzz_penalty: (payload: EarlyBuzzPenaltyPayload) => void;
  round_resolved: (payload: RoundResolvedPayload) => void;
  score_update: (payload: ScoreUpdatePayload) => void;

  // Clock sync (Phase 5)
  sync_pong: (payload: SyncPongPayload) => void;

  // Errors
  server_error: (payload: ServerErrorPayload) => void;
}

export interface ClientToServerEvents {
  // Room lifecycle
  create_room: (payload: CreateRoomPayload) => void;
  join_room: (payload: JoinRoomPayload) => void;

  // Buzz round
  open_buzz: (payload: OpenBuzzPayload) => void;
  close_buzz: () => void;
  reset_round: () => void;
  buzz: (payload: BuzzPayload) => void;
  advance_queue: (payload: AdvanceQueuePayload) => void;

  // Clock sync (Phase 5)
  sync_ping: (payload: SyncPingPayload) => void;
}
