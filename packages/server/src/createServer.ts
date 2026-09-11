import { createServer as createHttpServer } from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { Server as SocketIOServer } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@buzzroom/shared";

import { healthRouter } from "./routes/health.js";
import { RoomStore } from "./rooms/RoomStore.js";
import { registerSocketHandlers } from "./sockets/registerSocketHandlers.js";

export interface ServerConfig {
  clientOrigin: string;
  /**
   * Absolute path to the built client. When set, the server also serves the
   * app, putting both halves on one origin. Omit to run API-only, which is
   * what tests and local development do (Vite serves the client there).
   */
  clientDist?: string;
}

export function createServer(config: ServerConfig) {
  const app = express();

  app.use(
    helmet({
      // The defaults are tuned for an API. Now that the server can also serve
      // the app, the policy has to describe what the app actually does:
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          // React sets style attributes directly (progress bars, team colour
          // bars, the slider thumb), and inline style attributes need
          // 'unsafe-inline'.
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          // Socket.io upgrades to a WebSocket on this same origin.
          connectSrc: ["'self'", "ws:", "wss:"],
          fontSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'self'"],
          // Deliberately no upgrade-insecure-requests: it would break a plain
          // HTTP deployment, and hosts that terminate TLS send HSTS anyway.
          upgradeInsecureRequests: null,
        },
      },
    }),
  );
  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json());
  app.use(healthRouter);

  const httpServer = createHttpServer(app);

  // Typed with our event maps so every .emit() call is checked against
  // the protocol defined in @buzzroom/shared.
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      cors: { origin: config.clientOrigin },
    },
  );

  const store = new RoomStore();
  registerSocketHandlers(io, store);

  // Static last, so /health and anything else the API owns wins. Socket.io
  // never reaches Express at all -- Engine.io claims /socket.io/ requests off
  // the HTTP server before Express sees them.
  if (config.clientDist !== undefined) {
    const dist = config.clientDist;
    app.use(express.static(dist));

    // SPA fallback: /?present=CODE and friends are client-side routes with no
    // file behind them. Registered as plain middleware rather than a wildcard
    // route because Express 5 no longer accepts "*" as a path.
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      if (!req.accepts("html")) return next();
      res.sendFile("index.html", { root: dist });
    });
  }

  // Expose store so the entry point can start the cleanup interval,
  // and tests can inspect state directly.
  return { app, httpServer, io, store };
}
