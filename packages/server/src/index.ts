import "dotenv/config";
import { createServer } from "./createServer.js";
import { ROOM_CLEANUP_INTERVAL_MS, ROOM_MAX_AGE_MS } from "./constants.js";

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const { httpServer, store } = createServer({ clientOrigin: CLIENT_ORIGIN });

// The cleanup interval runs in the background and removes rooms that
// have been idle for too long. It's started here (in the entry point)
// rather than inside createServer so that tests, which also call
// createServer, never have a long-running timer keeping the process alive.
store.startCleanupInterval(ROOM_CLEANUP_INTERVAL_MS, ROOM_MAX_AGE_MS);

httpServer.listen(PORT, () => {
  console.log(`buzzroom server listening on port ${PORT}`);
  console.log(`accepting requests from: ${CLIENT_ORIGIN}`);
});
