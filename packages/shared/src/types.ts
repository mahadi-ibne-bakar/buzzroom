export interface PlayerView {
  playerId: string;
  name: string;
  score: number;
  isConnected: boolean;
}

export interface BuzzEntryView {
  rank: number;
  playerId: string;
  playerName: string;
  eliminated: boolean;
  adjustedTime: number;
  nearTie: boolean;
}

export interface RoundView {
  roundId: string;
  status: "open" | "closed";
  buzzMode: "button";
  activePlayerId: string | null;
  buzzOrder: BuzzEntryView[];
}

// Represents one row in the ranked leaderboard.
// Uses standard competition ranking (1-1-3, not 1-1-2):
// tied players share a rank; the next rank skips accordingly.
export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  name: string;
  score: number;
  isConnected: boolean;
  isTied: boolean; // shares their score with at least one other player
}

export interface RoomView {
  roomId: string;
  roomCode: string;
  hostPlayerId: string;
  players: PlayerView[];
  round: RoundView | null;
}
