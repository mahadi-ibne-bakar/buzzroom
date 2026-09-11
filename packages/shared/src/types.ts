export interface TeamView {
  teamId: string;
  name: string;
  colour: string; // hex, assigned on creation from a fixed palette
}

export interface PlayerView {
  playerId: string;
  name: string;
  score: number;
  isConnected: boolean;
  // Which team this player scores for, or null when they're unassigned or
  // team mode is off.
  teamId: string | null;
  // Last round-trip time this player reported, in ms. Only the client can
  // measure it (the calculation needs its own receive time), so it rides
  // along on the next sync_ping. null until that first report lands.
  rttMs: number | null;
}

/**
 * Whether a buzz only counts once the host has opened the window.
 *
 * "locked"  buzzing before the round opens earns an early-buzz penalty.
 * "free"    players may buzz whenever they like, including before the host
 *           opens anything and after they close it. No penalty applies.
 */
export type BuzzWindowMode = "free" | "locked";

/** Room accent colour. Purely cosmetic; drives the CSS accent variables. */
export const ACCENTS = ["indigo", "emerald", "rose", "amber"] as const;
export type Accent = (typeof ACCENTS)[number];

export type AudienceVote = "agree" | "disagree";

export interface VoteTally {
  /** Who the audience is voting on, or null when nobody has been called on. */
  activePlayerId: string | null;
  agree: number;
  disagree: number;
}

export interface RoomSettingsView {
  buzzWindowMode: BuzzWindowMode;
  earlyBuzzPenalty: boolean;
  // When on, everyone except the player who has been called on can register
  // agree/disagree while the host decides. Advisory only -- it never changes
  // a score.
  audienceVoting: boolean;
  accent: Accent;
  // Shown instead of "BuzzRoom" on the presenter screen. Empty means no
  // branding, and the room falls back to the default wording.
  title: string;
  // When on, the leaderboard ranks teams instead of individuals. Player
  // scores still exist underneath -- a team's score is the sum of its
  // members' -- so switching modes never loses anything.
  teamsEnabled: boolean;
}

export type BuzzMode = "button" | "slide" | "pattern";

// Generated fresh every round and broadcast at open time.
// The token prevents pre-submitting a cached buzz from a previous round.
export type ModeParams =
  | { mode: "button" }
  | { mode: "slide"; token: string }
  | { mode: "pattern"; token: string; sequence: number[] };

export interface BuzzEntryView {
  rank: number;
  playerId: string;
  playerName: string;
  eliminated: boolean;
  adjustedTime: number;
  nearTie: boolean;
  mode: BuzzMode;
}

export interface RoundView {
  roundId: string;
  status: "open" | "closed";
  modeParams: ModeParams;
  activePlayerId: string | null;
  buzzOrder: BuzzEntryView[];
}

export interface TeamLeaderboardEntry {
  rank: number;
  teamId: string;
  name: string;
  colour: string;
  score: number;
  memberCount: number;
  isTied: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  name: string;
  score: number;
  isConnected: boolean;
  isTied: boolean;
}

export interface RoomView {
  roomId: string;
  roomCode: string;
  hostPlayerId: string;
  players: PlayerView[];
  teams: TeamView[];
  // The question the host is currently on, for the presenter screen. Empty
  // when the host isn't using a question bank. The bank itself lives in the
  // host's browser -- the server only ever knows the current line.
  currentQuestion: string;
  settings: RoomSettingsView;
  round: RoundView | null;
}
