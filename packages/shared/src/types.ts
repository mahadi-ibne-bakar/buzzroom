export interface PlayerView {
  playerId: string;
  name: string;
  score: number;
  isConnected: boolean;
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
  round: RoundView | null;
}
