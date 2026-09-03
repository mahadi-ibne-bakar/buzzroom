import { afterEach, describe, expect, it } from "vitest";
import { type Socket as ClientSocket, io as ioClient } from "socket.io-client";
import { createServer } from "../createServer.js";

describe("socket.io connection", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("accepts a client connection", async () => {
    const { httpServer, io } = createServer({
      clientOrigin: "http://localhost:5173",
    });

    // Port 0 tells the OS "give me any free port" -- this is what lets
    // tests run in parallel and on CI without ever colliding over a
    // hardcoded port number.
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const address = httpServer.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected httpServer to be listening on a port");
    }
    const port = address.port;

    const client: ClientSocket = ioClient(`http://localhost:${port}`);

    cleanup = () => {
      client.close();
      io.close();
      httpServer.close();
    };

    await new Promise<void>((resolve, reject) => {
      client.on("connect", () => resolve());
      client.on("connect_error", reject);
    });

    expect(client.connected).toBe(true);
  });
});
