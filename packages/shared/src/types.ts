// These are the "view" types — the client-facing representations of
// domain objects. They deliberately omit internal server fields like
// socketId (which the client has no business knowing) so that the
// server never leaks implementation details over the wire.

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
  // Phase 5 additions — exposed to the host for transparency:
  adjustedTime: number; // estimated server-clock time of the buzz
  nearTie: boolean; // true if within NEAR_TIE_THRESHOLD_MS of an adjacent entry
}

export interface RoundView {
  roundId: string;
  status: "open" | "closed";
  buzzMode: "button"; // will expand to "slide" | "pattern" in Phase 8
  activePlayerId: string | null;
  buzzOrder: BuzzEntryView[];
}

export interface RoomView {
  roomId: string;
  roomCode: string;
  hostPlayerId: string;
  players: PlayerView[];
  round: RoundView | null;
}
