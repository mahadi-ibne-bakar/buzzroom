import "dotenv/config";
import { createServer } from "./createServer.js";

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const { httpServer } = createServer({ clientOrigin: CLIENT_ORIGIN });

httpServer.listen(PORT, () => {
  console.log(`buzzroom server listening on port ${PORT}`);
  console.log(`accepting requests from: ${CLIENT_ORIGIN}`);
});
