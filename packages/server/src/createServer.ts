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
}

export function createServer(config: ServerConfig) {
  const app = express();

  app.use(helmet());
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

  // Expose store so the entry point can start the cleanup interval,
  // and tests can inspect state directly.
  return { app, httpServer, io, store };
}
