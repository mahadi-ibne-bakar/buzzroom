import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type {
  BuzzOrderUpdatedPayload,
  EarlyBuzzPenaltyPayload,
  JoinOkPayload,
  RoomCreatedPayload,
  RoundOpenedPayload,
  RoundResolvedPayload,
  ScoreUpdatePayload,
  ServerErrorPayload,
} from "@buzzroom/shared";
import { createServer } from "../createServer.js";

// ---------- helpers ----------

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

function waitForEvent<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, (p: T) => resolve(p)));
}

// ---------- setup ----------

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
  for (const c of clients.splice(0)) c.close();
  stopServer();
});

async function makeClient(): Promise<ClientSocket> {
  const c = ioClient(`http://localhost:${port}`);
  clients.push(c);
  await waitForConnect(c);
  return c;
}

// Convenience: set up a room and return host socket + room code.
async function openRoom(
  hostName = "Host",
): Promise<{ host: ClientSocket; roomCode: string; hostPlayerId: string }> {
  const host = await makeClient();
  const roomCreated = waitForEvent<RoomCreatedPayload>(host, "room_created");
  host.emit("create_room", { hostName });
  const { room, yourPlayerId } = await roomCreated;
  return { host, roomCode: room.roomCode, hostPlayerId: yourPlayerId };
}

// Convenience: join a player into a room and return their socket + playerId.
async function joinPlayer(
  roomCode: string,
  playerName: string,
): Promise<{ player: ClientSocket; playerId: string }> {
  const player = await makeClient();
  const joinOk = waitForEvent<JoinOkPayload>(player, "join_ok");
  player.emit("join_room", { roomCode, playerName });
  const { yourPlayerId } = await joinOk;
  return { player, playerId: yourPlayerId };
}

// ---------- open_buzz ----------

describe("open_buzz", () => {
  it("host opens a round and all players receive round_opened", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    const hostGetsRound = waitForEvent<RoundOpenedPayload>(
      host,
      "round_opened",
    );
    const playerGetsRound = waitForEvent<RoundOpenedPayload>(
      player,
      "round_opened",
    );

    host.emit("open_buzz", { buzzMode: "button" });

    const [h, p] = await Promise.all([hostGetsRound, playerGetsRound]);

    expect(h.round.status).toBe("open");
    expect(h.round.buzzMode).toBe("button");
    expect(h.round.buzzOrder).toHaveLength(0);
    expect(p.round.roundId).toBe(h.round.roundId); // same round on both sides
  });

  it("non-host receives UNAUTHORIZED if they try to open a round", async () => {
    const { roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    const err = waitForEvent<ServerErrorPayload>(player, "server_error");
    player.emit("open_buzz", { buzzMode: "button" });

    const payload = await err;
    expect(payload.code).toBe("UNAUTHORIZED");
  });
});

// ---------- buzz ----------

describe("buzz", () => {
  it("player buzzes and everyone gets buzz_order_updated with rank 1", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    host.emit("open_buzz", { buzzMode: "button" });
    await waitForEvent(host, "round_opened");

    const hostSeesBuzz = waitForEvent<BuzzOrderUpdatedPayload>(
      host,
      "buzz_order_updated",
    );
    const playerSeesBuzz = waitForEvent<BuzzOrderUpdatedPayload>(
      player,
      "buzz_order_updated",
    );

    player.emit("buzz", { mode: "button" });

    const [h] = await Promise.all([hostSeesBuzz, playerSeesBuzz]);

    expect(h.buzzOrder).toHaveLength(1);
    expect(h.buzzOrder[0]!.rank).toBe(1);
    expect(h.buzzOrder[0]!.playerName).toBe("Alice");
    expect(h.activePlayerId).toBe(h.buzzOrder[0]!.playerId);
  });

  it("two players buzz — ranks assigned in arrival order", async () => {
    const { host, roomCode } = await openRoom();
    const { player: p1 } = await joinPlayer(roomCode, "Alice");
    const { player: p2 } = await joinPlayer(roomCode, "Bob");

    host.emit("open_buzz", { buzzMode: "button" });
    await waitForEvent(host, "round_opened");

    // Emit first buzz, wait for it to be processed before the second
    const firstUpdate = waitForEvent<BuzzOrderUpdatedPayload>(
      host,
      "buzz_order_updated",
    );
    p1.emit("buzz", { mode: "button" });
    await firstUpdate;

    const secondUpdate = waitForEvent<BuzzOrderUpdatedPayload>(
      host,
      "buzz_order_updated",
    );
    p2.emit("buzz", { mode: "button" });
    const update = await secondUpdate;

    expect(update.buzzOrder).toHaveLength(2);
    expect(update.buzzOrder[0]!.playerName).toBe("Alice"); // arrived first
    expect(update.buzzOrder[0]!.rank).toBe(1);
    expect(update.buzzOrder[1]!.rank).toBe(2);
  });

  it("player gets ALREADY_BUZZED if they buzz twice", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    host.emit("open_buzz", { buzzMode: "button" });
    await waitForEvent(host, "round_opened");

    // First buzz accepted
    const firstOk = waitForEvent(player, "buzz_order_updated");
    player.emit("buzz", { mode: "button" });
    await firstOk;

    // Second buzz rejected
    const err = waitForEvent<ServerErrorPayload>(player, "server_error");
    player.emit("buzz", { mode: "button" });
    const payload = await err;

    expect(payload.code).toBe("ALREADY_BUZZED");
  });

  it("player gets early_buzz_penalty when buzzing after round is closed", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    // Open then immediately close the round (no one buzzes)
    host.emit("open_buzz", { buzzMode: "button" });
    await waitForEvent(host, "round_opened");
    host.emit("close_buzz");
    await waitForEvent(host, "round_closed");

    const penalty = waitForEvent<EarlyBuzzPenaltyPayload>(
      player,
      "early_buzz_penalty",
    );
    player.emit("buzz", { mode: "button" });
    const p = await penalty;

    expect(p.lockedForMs).toBe(500);
    expect(p.offenseCount).toBe(1);
  });

  it("returns NO_ACTIVE_ROUND when there is no open round", async () => {
    const { roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    const err = waitForEvent<ServerErrorPayload>(player, "server_error");
    player.emit("buzz", { mode: "button" });
    const payload = await err;

    expect(payload.code).toBe("NO_ACTIVE_ROUND");
  });
});

// ---------- close_buzz ----------

describe("close_buzz", () => {
  it("host closes round and all players receive round_closed", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    host.emit("open_buzz", { buzzMode: "button" });
    await waitForEvent(host, "round_opened");

    const hostClosed = waitForEvent(host, "round_closed");
    const playerClosed = waitForEvent(player, "round_closed");

    host.emit("close_buzz");
    await Promise.all([hostClosed, playerClosed]);
    // If we reach here without timeout, both received the event
  });

  it("returns INVALID_STATE if there is no open round to close", async () => {
    const { host } = await openRoom();

    const err = waitForEvent<ServerErrorPayload>(host, "server_error");
    host.emit("close_buzz");
    const payload = await err;

    expect(payload.code).toBe("INVALID_STATE");
  });
});

// ---------- reset_round ----------

describe("reset_round", () => {
  it("host resets round and all players receive round_reset", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    host.emit("open_buzz", { buzzMode: "button" });
    await waitForEvent(host, "round_opened");

    const hostReset = waitForEvent(host, "round_reset");
    const playerReset = waitForEvent(player, "round_reset");

    host.emit("reset_round");
    await Promise.all([hostReset, playerReset]);
  });
});

// ---------- advance_queue ----------

describe("advance_queue — wrong", () => {
  it("marks first player wrong, second becomes active", async () => {
    const { host, roomCode } = await openRoom();
    const { player: p1 } = await joinPlayer(roomCode, "Alice");
    const { player: p2 } = await joinPlayer(roomCode, "Bob");

    host.emit("open_buzz", { buzzMode: "button" });
    await waitForEvent(host, "round_opened");

    // Both buzz in order
    const firstBuzz = waitForEvent(host, "buzz_order_updated");
    p1.emit("buzz", { mode: "button" });
    await firstBuzz;

    const secondBuzz = waitForEvent(host, "buzz_order_updated");
    p2.emit("buzz", { mode: "button" });
    await secondBuzz;

    // Host marks Alice wrong
    const update = waitForEvent<BuzzOrderUpdatedPayload>(
      host,
      "buzz_order_updated",
    );
    host.emit("advance_queue", { result: "wrong" });
    const payload = await update;

    expect(payload.buzzOrder[0]!.eliminated).toBe(true); // Alice eliminated
    expect(payload.activePlayerId).toBe(payload.buzzOrder[1]!.playerId); // Bob is next
  });
});

describe("advance_queue — correct", () => {
  it("marks player correct, awards a point, broadcasts round_resolved + score_update", async () => {
    const { host, roomCode } = await openRoom();
    const { player, playerId } = await joinPlayer(roomCode, "Alice");

    host.emit("open_buzz", { buzzMode: "button" });
    await waitForEvent(host, "round_opened");

    const buzzed = waitForEvent(host, "buzz_order_updated");
    player.emit("buzz", { mode: "button" });
    await buzzed;

    const resolved = waitForEvent<RoundResolvedPayload>(host, "round_resolved");
    const scoreUpdate = waitForEvent<ScoreUpdatePayload>(host, "score_update");

    host.emit("advance_queue", { result: "correct" });

    const [r, s] = await Promise.all([resolved, scoreUpdate]);

    expect(r.winnerPlayerId).toBe(playerId);
    expect(r.winnerName).toBe("Alice");
    expect(r.pointsAwarded).toBe(1);

    const alice = s.players.find((p) => p.playerId === playerId);
    expect(alice?.score).toBe(1);
  });
});
