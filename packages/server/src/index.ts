import "dotenv/config";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "./createServer.js";
import { ROOM_CLEANUP_INTERVAL_MS, ROOM_MAX_AGE_MS } from "./constants.js";

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

/**
 * Where the built client lives, if it has been built.
 *
 * The default resolves to packages/client/dist from either the TypeScript
 * entry point (packages/server/src) or the bundled one (packages/server/dist)
 * — both are two levels below the repo root, so one relative path covers dev
 * and production.
 *
 * Serving is decided by whether that directory exists rather than by
 * NODE_ENV: in development the client is served by Vite on its own port and
 * this side simply runs API-only.
 */
const CLIENT_DIST =
  process.env.CLIENT_DIST ??
  fileURLToPath(new URL("../../client/dist", import.meta.url));

const serveClient = existsSync(CLIENT_DIST);

const { httpServer, store } = createServer({
  clientOrigin: CLIENT_ORIGIN,
  clientDist: serveClient ? CLIENT_DIST : undefined,
});

// The cleanup interval runs in the background and removes rooms that
// have been idle for too long. It's started here (in the entry point)
// rather than inside createServer so that tests, which also call
// createServer, never have a long-running timer keeping the process alive.
store.startCleanupInterval(ROOM_CLEANUP_INTERVAL_MS, ROOM_MAX_AGE_MS);

httpServer.listen(PORT, () => {
  console.log(`buzzroom server listening on port ${PORT}`);
  if (serveClient) {
    console.log(`serving the client from: ${CLIENT_DIST}`);
  } else {
    console.log(`api only -- no client build at ${CLIENT_DIST}`);
    console.log(`accepting cross-origin requests from: ${CLIENT_ORIGIN}`);
  }
});
