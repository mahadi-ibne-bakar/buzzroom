import { createServer as createHttpServer } from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { Server as SocketIOServer } from "socket.io";

import { healthRouter } from "./routes/health.js";
import { registerSocketHandlers } from "./sockets/registerSocketHandlers.js";

export interface ServerConfig {
  /** Origin(s) allowed to connect, for both REST and Socket.io. */
  clientOrigin: string;
}

/**
 * Builds the app, HTTP server, and Socket.io server, but does NOT call
 * `.listen()`. Splitting "build" from "run" like this is what lets tests
 * start a real server on a random free port and tear it down afterwards,
 * instead of fighting over a hardcoded port number or mocking everything.
 */
export function createServer(config: ServerConfig) {
  const app = express();

  // helmet sets a handful of security-relevant HTTP headers (e.g. it stops
  // the app advertising "X-Powered-By: Express" to anyone probing it).
  // It's effectively free, so it's on from the very first request handler
  // we ever write, not bolted on later.
  app.use(helmet());

  // Restrict which origins may call the REST API. We deliberately do NOT
  // default to "*" -- an explicit, configured origin is the safe default,
  // and it's one less thing to remember to tighten later.
  app.use(cors({ origin: config.clientOrigin }));

  app.use(express.json());

  app.use(healthRouter);

  const httpServer = createHttpServer(app);

  // Socket.io's handshake (especially its initial HTTP polling step, before
  // the connection upgrades to a real WebSocket) is a separate surface from
  // the Express routes above, so it needs its own CORS configuration --
  // setting `cors` on the Express app does not cover this.
  const io = new SocketIOServer(httpServer, {
    cors: { origin: config.clientOrigin },
  });

  registerSocketHandlers(io);

  return { app, httpServer, io };
}
