import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type {
  JoinOkPayload,
  PlayerJoinedPayload,
  PlayerLeftPayload,
  RoomCreatedPayload,
  ServerErrorPayload,
} from "@buzzroom/shared";
import { createServer } from "../createServer.js";

// ---------- helpers ----------

/** Wait for a socket to connect (or reject if it errors). */
function waitForConnect(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
}

/** Wait for a specific event, returning its payload. */
function waitForEvent<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => {
    socket.once(event, (payload: T) => resolve(payload));
  });
}

// ---------- test setup ----------

let port: number;
let stopServer: () => void;
const clients: ClientSocket[] = [];

beforeEach(async () => {
  const { httpServer, io } = createServer({ clientOrigin: "*" });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  port = (httpServer.address() as AddressInfo).port;
  stopServer = () => {
    io.close();
    httpServer.close();
  };
});

afterEach(() => {
  // Close every client created during the test
  for (const c of clients.splice(0)) c.close();
  stopServer();
});

/** Creates a client, registers it for cleanup, and waits for it to connect. */
async function makeClient(): Promise<ClientSocket> {
  const c = ioClient(`http://localhost:${port}`);
  clients.push(c);
  await waitForConnect(c);
  return c;
}

// ---------- tests ----------

describe("create_room", () => {
  it("host receives room_created with a valid room code", async () => {
    const host = await makeClient();

    const received = waitForEvent<RoomCreatedPayload>(host, "room_created");
    host.emit("create_room", { hostName: "Alice" });
    const payload = await received;

    expect(payload.room.roomCode).toHaveLength(6);
    expect(payload.room.players).toHaveLength(1);
    expect(payload.room.players[0]!.name).toBe("Alice");
    expect(payload.yourPlayerId).toBe(payload.room.hostPlayerId);
  });

  it("returns NAME_INVALID if the name is blank after sanitization", async () => {
    const host = await makeClient();

    // "   " passes Zod's min(1) check (length 3), but sanitizeName trims
    // it to "" and the handler returns NAME_INVALID.
    const received = waitForEvent<ServerErrorPayload>(host, "server_error");
    host.emit("create_room", { hostName: "   " });
    const err = await received;

    expect(err.code).toBe("NAME_INVALID");
  });

  it("returns RATE_LIMITED after too many create_room events", async () => {
    const host = await makeClient();

    // Exhaust the 3-per-minute limit
    for (let i = 0; i < 3; i++) {
      host.emit("create_room", { hostName: `Host${i}` });
    }

    const received = waitForEvent<ServerErrorPayload>(host, "server_error");
    host.emit("create_room", { hostName: "TooMany" });
    const err = await received;

    expect(err.code).toBe("RATE_LIMITED");
  });
});

describe("join_room", () => {
  it("player receives join_ok with the current room state", async () => {
    const host = await makeClient();
    const roomCreated = waitForEvent<RoomCreatedPayload>(host, "room_created");
    host.emit("create_room", { hostName: "Alice" });
    const { room } = await roomCreated;

    const player = await makeClient();
    const joinOk = waitForEvent<JoinOkPayload>(player, "join_ok");
    player.emit("join_room", {
      roomCode: room.roomCode,
      playerName: "Bob",
    });
    const payload = await joinOk;

    expect(payload.room.players).toHaveLength(2);
    expect(payload.room.players.map((p) => p.name)).toContain("Bob");
  });

  it("host receives player_joined when a new player joins", async () => {
    const host = await makeClient();
    const roomCreated = waitForEvent<RoomCreatedPayload>(host, "room_created");
    host.emit("create_room", { hostName: "Alice" });
    const { room } = await roomCreated;

    const playerJoined = waitForEvent<PlayerJoinedPayload>(
      host,
      "player_joined",
    );

    const player = await makeClient();
    player.emit("join_room", { roomCode: room.roomCode, playerName: "Bob" });

    const joined = await playerJoined;
    expect(joined.player.name).toBe("Bob");
  });

  it("returns ROOM_NOT_FOUND for an unknown room code", async () => {
    const player = await makeClient();
    const err = waitForEvent<ServerErrorPayload>(player, "server_error");
    player.emit("join_room", { roomCode: "XXXXXX", playerName: "Bob" });

    const payload = await err;
    expect(payload.code).toBe("ROOM_NOT_FOUND");
  });

  it("returns NAME_TAKEN when a name is already in use", async () => {
    const host = await makeClient();
    const roomCreated = waitForEvent<RoomCreatedPayload>(host, "room_created");
    host.emit("create_room", { hostName: "Alice" });
    const { room } = await roomCreated;

    const player = await makeClient();
    player.emit("join_room", { roomCode: room.roomCode, playerName: "Alice" });

    const err = waitForEvent<ServerErrorPayload>(player, "server_error");
    const payload = await err;
    expect(payload.code).toBe("NAME_TAKEN");
  });
});

describe("disconnect", () => {
  it("remaining players receive player_left when someone disconnects", async () => {
    const host = await makeClient();
    const roomCreated = waitForEvent<RoomCreatedPayload>(host, "room_created");
    host.emit("create_room", { hostName: "Alice" });
    const { room } = await roomCreated;

    const player = await makeClient();
    const joinOk = waitForEvent<JoinOkPayload>(player, "join_ok");
    player.emit("join_room", { roomCode: room.roomCode, playerName: "Bob" });
    await joinOk; // wait for join to complete before disconnecting

    const playerLeft = waitForEvent<PlayerLeftPayload>(host, "player_left");
    player.close();

    const payload = await playerLeft;
    expect(payload.playerName).toBe("Bob");
  });
});
