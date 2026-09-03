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

export interface RoomView {
  roomId: string;
  roomCode: string;
  hostPlayerId: string;
  players: PlayerView[];
}
