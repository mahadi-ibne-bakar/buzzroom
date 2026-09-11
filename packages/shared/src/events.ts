import type {
  AdvanceQueuePayload,
  AssignTeamPayload,
  AwardPointsPayload,
  CastVotePayload,
  CreateTeamPayload,
  DeleteTeamPayload,
  BuzzPayload,
  CreateRoomPayload,
  JoinRoomPayload,
  OpenBuzzPayload,
  ReconnectRoomPayload,
  SyncPingPayload,
  UpdateSettingsPayload,
  WatchRoomPayload,
} from "./payloads.js";
import type {
  BuzzEntryView,
  LeaderboardEntry,
  PlayerView,
  RoomSettingsView,
  RoomView,
  RoundView,
  TeamLeaderboardEntry,
  TeamView,
  VoteTally,
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
  // Empty unless team mode is on. A team's score is the sum of its members',
  // so this is derived from the same player scores rather than tracked
  // separately -- there is only ever one place a point lives.
  teamLeaderboard: TeamLeaderboardEntry[];
}
export interface VoteTallyPayload {
  tally: VoteTally;
}
export interface TeamsUpdatedPayload {
  teams: TeamView[];
  players: PlayerView[];
}
export interface SyncPongPayload {
  t0: number;
  ts: number;
}
export interface SettingsUpdatedPayload {
  settings: RoomSettingsView;
}
export interface PingUpdatePayload {
  pings: { playerId: string; rttMs: number | null }[];
}
export interface WatchOkPayload {
  room: RoomView;
  leaderboard: LeaderboardEntry[];
  teamLeaderboard: TeamLeaderboardEntry[];
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

export type {
  RoundView,
  ModeParams,
  BuzzWindowMode,
  RoomSettingsView,
  TeamView,
  TeamLeaderboardEntry,
  AudienceVote,
  VoteTally,
  Accent,
} from "./types.js";

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
  settings_updated: (p: SettingsUpdatedPayload) => void;
  teams_updated: (p: TeamsUpdatedPayload) => void;
  vote_tally: (p: VoteTallyPayload) => void;
  ping_update: (p: PingUpdatePayload) => void;
  host_left: () => void;
  reconnect_ok: (p: ReconnectOkPayload) => void;
  watch_ok: (p: WatchOkPayload) => void;
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
  update_settings: (p: UpdateSettingsPayload) => void;
  watch_room: (p: WatchRoomPayload) => void;
  create_team: (p: CreateTeamPayload) => void;
  delete_team: (p: DeleteTeamPayload) => void;
  assign_team: (p: AssignTeamPayload) => void;
  cast_vote: (p: CastVotePayload) => void;
}
