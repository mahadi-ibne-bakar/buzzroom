import {
  CreateRoomPayloadSchema,
  JoinRoomPayloadSchema,
} from "@buzzroom/shared";
import type { RoomStore } from "../rooms/RoomStore.js";
import type { TypedServer } from "../socketTypes.js";
import { onCreateRoom } from "./handlers/onCreateRoom.js";
import { onDisconnect } from "./handlers/onDisconnect.js";
import { onJoinRoom } from "./handlers/onJoinRoom.js";
import { SocketRateLimiter } from "./rateLimiter.js";

export function registerSocketHandlers(
  io: TypedServer,
  store: RoomStore,
): void {
  io.on("connection", (socket) => {
    console.log(`socket connected: ${socket.id}`);

    // Each connection gets its own limiter instance — no shared state
    // between different clients.
    const limiter = new SocketRateLimiter();

    // ---------- create_room ----------
    // Allow 3 room-creation attempts per minute per connection. Hosts
    // generally create a room once; this just stops a script from
    // hammering the endpoint.
    socket.on("create_room", (payload) => {
      if (!limiter.check("create_room", 3, 60_000)) {
        socket.emit("server_error", {
          code: "RATE_LIMITED",
          message: "Too many requests. Please wait before trying again.",
        });
        return;
      }

      // Validate the runtime value even though TypeScript already types it.
      // A malicious client can send any JSON — the TS types are erased.
      const result = CreateRoomPayloadSchema.safeParse(payload);
      if (!result.success) {
        socket.emit("server_error", {
          code: "VALIDATION_ERROR",
          message: "Invalid payload for create_room.",
        });
        return;
      }

      onCreateRoom(io, socket, store, result.data);
    });

    // ---------- join_room ----------
    // 10 attempts per minute — a player might mis-type the code a few
    // times, but more than 10 in a minute is suspicious.
    socket.on("join_room", (payload) => {
      if (!limiter.check("join_room", 10, 60_000)) {
        socket.emit("server_error", {
          code: "RATE_LIMITED",
          message: "Too many requests. Please wait before trying again.",
        });
        return;
      }

      const result = JoinRoomPayloadSchema.safeParse(payload);
      if (!result.success) {
        socket.emit("server_error", {
          code: "VALIDATION_ERROR",
          message: "Invalid payload for join_room.",
        });
        return;
      }

      onJoinRoom(io, socket, store, result.data);
    });

    // ---------- disconnect ----------
    socket.on("disconnect", (reason) => {
      console.log(`socket disconnected: ${socket.id} (${reason})`);
      onDisconnect(io, socket, store);
    });
  });
}
