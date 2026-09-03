import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@buzzroom/shared";

// The generic parameters tell Socket.io what events can be listened to
// (ClientToServerEvents) and what events can be emitted back
// (ServerToClientEvents). With these in place, socket.emit("wrong_name")
// or socket.on("nonexistent") becomes a TypeScript compile error.
export type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
