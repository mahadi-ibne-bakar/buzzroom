import type {
  AdvanceQueuePayload,
  AwardPointsPayload,
  BuzzPayload,
  CreateRoomPayload,
  JoinRoomPayload,
  OpenBuzzPayload,
  ReconnectRoomPayload,
  SyncPingPayload,
} from "./payloads.js";
import type {
  BuzzEntryView,
  LeaderboardEntry,
  PlayerView,
  RoomView,
  RoundView,
} from "./types.js";

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
  leaderboard: LeaderboardEntry[];
}
export interface SyncPongPayload {
  t0: number;
  ts: number;
}
export interface ReconnectOkPayload {
  room: RoomView;
  yourPlayerId: string;
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

export type { RoundView, ModeParams } from "./types.js";

export interface ServerToClientEvents {
  room_created: (p: RoomCreatedPayload) => void;
  join_ok: (p: JoinOkPayload) => void;
  player_joined: (p: PlayerJoinedPayload) => void;
  player_left: (p: PlayerLeftPayload) => void;
  round_opened: (p: RoundOpenedPayload) => void;
  round_closed: () => void;
  round_reset: () => void;
  buzz_order_updated: (p: BuzzOrderUpdatedPayload) => void;
  early_buzz_penalty: (p: EarlyBuzzPenaltyPayload) => void;
  round_resolved: (p: RoundResolvedPayload) => void;
  score_update: (p: ScoreUpdatePayload) => void;
  sync_pong: (p: SyncPongPayload) => void;
  host_left: () => void;
  reconnect_ok: (p: ReconnectOkPayload) => void;
  server_error: (p: ServerErrorPayload) => void;
}

export interface ClientToServerEvents {
  create_room: (p: CreateRoomPayload) => void;
  join_room: (p: JoinRoomPayload) => void;
  open_buzz: (p: OpenBuzzPayload) => void;
  close_buzz: () => void;
  reset_round: () => void;
  buzz: (p: BuzzPayload) => void;
  advance_queue: (p: AdvanceQueuePayload) => void;
  sync_ping: (p: SyncPingPayload) => void;
  award_points: (p: AwardPointsPayload) => void;
  reconnect_room: (p: ReconnectRoomPayload) => void;
}
