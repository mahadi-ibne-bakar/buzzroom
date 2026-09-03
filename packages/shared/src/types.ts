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
  eliminated: boolean; // true after the host marks this player wrong
}

export interface RoundView {
  roundId: string;
  status: "open" | "closed";
  buzzMode: "button"; // will expand to "slide" | "pattern" in Phase 8
  activePlayerId: string | null; // first non-eliminated player; null if none
  buzzOrder: BuzzEntryView[];
}

export interface RoomView {
  roomId: string;
  roomCode: string;
  hostPlayerId: string;
  players: PlayerView[];
  round: RoundView | null; // null = no buzz round currently active
}
