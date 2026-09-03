import type { CreateRoomPayload, JoinRoomPayload } from "./payloads.js";
import type { PlayerView, RoomView } from "./types.js";

// ---------- payloads sent server → client ----------

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

export interface ServerErrorPayload {
  // A machine-readable code the client can switch on, plus a
  // human-readable message for display or logging.
  code:
    | "VALIDATION_ERROR"
    | "RATE_LIMITED"
    | "ROOM_NOT_FOUND"
    | "ROOM_FULL"
    | "NAME_TAKEN"
    | "NAME_INVALID";
  message: string;
}

// ---------- Socket.io event maps ----------
// These drive TypeScript's autocomplete and type-checking for socket.on()
// and socket.emit() calls on both sides of the connection.

export interface ServerToClientEvents {
  room_created: (payload: RoomCreatedPayload) => void;
  join_ok: (payload: JoinOkPayload) => void;
  player_joined: (payload: PlayerJoinedPayload) => void;
  player_left: (payload: PlayerLeftPayload) => void;
  server_error: (payload: ServerErrorPayload) => void;
}

export interface ClientToServerEvents {
  create_room: (payload: CreateRoomPayload) => void;
  join_room: (payload: JoinRoomPayload) => void;
}
