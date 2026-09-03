import type { Server } from "socket.io";

/**
 * Wires up Socket.io event handlers. Deliberately minimal right now --
 * no rooms, no buzz events yet (that's Phase 3). This function exists so
 * that as real handlers get added, they have an obvious home instead of
 * piling up inline inside createServer.ts.
 */
export function registerSocketHandlers(io: Server) {
  io.on("connection", (socket) => {
    console.log(`socket connected: ${socket.id}`);

    socket.on("disconnect", (reason) => {
      console.log(`socket disconnected: ${socket.id} (${reason})`);
    });
  });
}
