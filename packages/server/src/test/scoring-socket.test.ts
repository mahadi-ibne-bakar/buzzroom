import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type {
  JoinOkPayload,
  RoomCreatedPayload,
  RoundResolvedPayload,
  ScoreUpdatePayload,
  ServerErrorPayload,
} from "@buzzroom/shared";
import { createServer } from "../createServer.js";

// ── helpers ───────────────────────────────────────────────────────────────

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

// ── setup ─────────────────────────────────────────────────────────────────

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

async function openRoom(): Promise<{
  host: ClientSocket;
  roomCode: string;
  hostPlayerId: string;
}> {
  const host = await makeClient();
  const p = waitForEvent<RoomCreatedPayload>(host, "room_created");
  host.emit("create_room", { hostName: "Host" });
  const { room, yourPlayerId } = await p;
  return { host, roomCode: room.roomCode, hostPlayerId: yourPlayerId };
}

async function joinPlayer(
  roomCode: string,
  name: string,
): Promise<{ player: ClientSocket; playerId: string }> {
  const player = await makeClient();
  const p = waitForEvent<JoinOkPayload>(player, "join_ok");
  player.emit("join_room", { roomCode, playerName: name });
  const { yourPlayerId } = await p;
  return { player, playerId: yourPlayerId };
}

// ── award_points ──────────────────────────────────────────────────────────

describe("award_points", () => {
  it("host awards points; all players receive score_update with leaderboard", async () => {
    const { host, roomCode } = await openRoom();
    const { player, playerId } = await joinPlayer(roomCode, "Alice");

    const hostUpdate = waitForEvent<ScoreUpdatePayload>(host, "score_update");
    const playerUpdate = waitForEvent<ScoreUpdatePayload>(
      player,
      "score_update",
    );

    host.emit("award_points", { playerId, delta: 3 });

    const [payload, pu] = await Promise.all([hostUpdate, playerUpdate]);

    // players array
    expect(payload.players.find((p) => p.playerId === playerId)?.score).toBe(3);

    // leaderboard received by host
    const aliceEntry = payload.leaderboard.find((e) => e.playerId === playerId);
    expect(aliceEntry?.score).toBe(3);
    expect(aliceEntry?.rank).toBe(1);

    // player received the same update
    expect(pu.leaderboard.find((e) => e.playerId === playerId)?.score).toBe(3);
  });

  it("host deducts points with a negative delta", async () => {
    const { host, roomCode } = await openRoom();
    const { playerId } = await joinPlayer(roomCode, "Alice");

    // Award first, then deduct
    const first = waitForEvent<ScoreUpdatePayload>(host, "score_update");
    host.emit("award_points", { playerId, delta: 5 });
    await first;

    const second = waitForEvent<ScoreUpdatePayload>(host, "score_update");
    host.emit("award_points", { playerId, delta: -2 });
    const payload = await second;

    const alice = payload.players.find((p) => p.playerId === playerId);
    expect(alice?.score).toBe(3);
  });

  it("non-host gets UNAUTHORIZED", async () => {
    const { roomCode } = await openRoom();
    const { player, playerId } = await joinPlayer(roomCode, "Alice");

    const err = waitForEvent<ServerErrorPayload>(player, "server_error");
    player.emit("award_points", { playerId, delta: 1 });
    const payload = await err;

    expect(payload.code).toBe("UNAUTHORIZED");
  });

  it("delta of 0 fails schema validation", async () => {
    const { host, roomCode } = await openRoom();
    const { playerId } = await joinPlayer(roomCode, "Alice");

    const err = waitForEvent<ServerErrorPayload>(host, "server_error");
    host.emit("award_points", { playerId, delta: 0 });
    const payload = await err;

    expect(payload.code).toBe("VALIDATION_ERROR");
  });

  it("unknown playerId returns ROOM_NOT_FOUND", async () => {
    const { host } = await openRoom();

    const err = waitForEvent<ServerErrorPayload>(host, "server_error");
    host.emit("award_points", {
      playerId: "00000000-0000-0000-0000-000000000000",
      delta: 1,
    });
    const payload = await err;

    expect(payload.code).toBe("ROOM_NOT_FOUND");
  });
});

// ── advance_queue with configurable points ────────────────────────────────

describe("advance_queue — configurable points", () => {
  it("awards the default of 1 point when points field is omitted", async () => {
    const { host, roomCode } = await openRoom();
    const { playerId } = await joinPlayer(roomCode, "Alice");

    host.emit("open_buzz", { buzzMode: "button" });
    await waitForEvent(host, "round_opened");

    const buzzed = waitForEvent(host, "buzz_order_updated");
    const t = Date.now();
    // Need to emit from the player socket, not host
    const playerSocket = clients[clients.length - 1]!;
    playerSocket.emit("buzz", {
      mode: "button",
      localTime: t,
      adjustedTime: t,
    });
    await buzzed;

    const resolved = waitForEvent<RoundResolvedPayload>(host, "round_resolved");
    const scoreUp = waitForEvent<ScoreUpdatePayload>(host, "score_update");

    host.emit("advance_queue", { result: "correct" }); // no points field

    const [r, s] = await Promise.all([resolved, scoreUp]);
    expect(r.pointsAwarded).toBe(1);
    expect(s.players.find((p) => p.playerId === playerId)?.score).toBe(1);
  });

  it("awards the specified points when host provides a custom value", async () => {
    const { host, roomCode } = await openRoom();
    const { playerId } = await joinPlayer(roomCode, "Alice");

    host.emit("open_buzz", { buzzMode: "button" });
    await waitForEvent(host, "round_opened");

    const buzzed = waitForEvent(host, "buzz_order_updated");
    const t = Date.now();
    const playerSocket = clients[clients.length - 1]!;
    playerSocket.emit("buzz", {
      mode: "button",
      localTime: t,
      adjustedTime: t,
    });
    await buzzed;

    const resolved = waitForEvent<RoundResolvedPayload>(host, "round_resolved");
    const scoreUp = waitForEvent<ScoreUpdatePayload>(host, "score_update");

    host.emit("advance_queue", { result: "correct", points: 5 });

    const [r, s] = await Promise.all([resolved, scoreUp]);
    expect(r.pointsAwarded).toBe(5);
    expect(s.players.find((p) => p.playerId === playerId)?.score).toBe(5);
  });

  it("awards 0 points when host resolves a question with points: 0", async () => {
    const { host, roomCode } = await openRoom();
    const { playerId } = await joinPlayer(roomCode, "Alice");

    host.emit("open_buzz", { buzzMode: "button" });
    await waitForEvent(host, "round_opened");

    const buzzed = waitForEvent(host, "buzz_order_updated");
    const t = Date.now();
    const playerSocket = clients[clients.length - 1]!;
    playerSocket.emit("buzz", {
      mode: "button",
      localTime: t,
      adjustedTime: t,
    });
    await buzzed;

    const resolved = waitForEvent<RoundResolvedPayload>(host, "round_resolved");
    const scoreUp = waitForEvent<ScoreUpdatePayload>(host, "score_update");

    host.emit("advance_queue", { result: "correct", points: 0 });

    const [r, s] = await Promise.all([resolved, scoreUp]);
    expect(r.pointsAwarded).toBe(0);
    expect(s.players.find((p) => p.playerId === playerId)?.score).toBe(0);
  });
});

// ── leaderboard correctness ───────────────────────────────────────────────

describe("leaderboard in score_update", () => {
  it("leaderboard is sorted by score and includes correct ranks", async () => {
    const { host, roomCode, hostPlayerId } = await openRoom();
    const { playerId: aliceId } = await joinPlayer(roomCode, "Alice");
    const { playerId: bobId } = await joinPlayer(roomCode, "Bob");

    // Give Alice 3 points and Bob 1 point
    const first = waitForEvent<ScoreUpdatePayload>(host, "score_update");
    host.emit("award_points", { playerId: aliceId, delta: 3 });
    await first;

    const second = waitForEvent<ScoreUpdatePayload>(host, "score_update");
    host.emit("award_points", { playerId: bobId, delta: 1 });
    const { leaderboard } = await second;

    // Alice: 3 pts → rank 1
    // Bob:   1 pt  → rank 2
    // Host:  0 pts → rank 3
    expect(leaderboard[0]!.playerId).toBe(aliceId);
    expect(leaderboard[0]!.rank).toBe(1);
    expect(leaderboard[0]!.score).toBe(3);

    expect(leaderboard[1]!.playerId).toBe(bobId);
    expect(leaderboard[1]!.rank).toBe(2);

    expect(leaderboard[2]!.playerId).toBe(hostPlayerId);
    expect(leaderboard[2]!.rank).toBe(3);
  });

  it("leaderboard shows isTied: true when two players have equal scores", async () => {
    const { host, roomCode } = await openRoom();
    const { playerId: aliceId } = await joinPlayer(roomCode, "Alice");
    const { playerId: bobId } = await joinPlayer(roomCode, "Bob");

    const first = waitForEvent<ScoreUpdatePayload>(host, "score_update");
    host.emit("award_points", { playerId: aliceId, delta: 2 });
    await first;

    const second = waitForEvent<ScoreUpdatePayload>(host, "score_update");
    host.emit("award_points", { playerId: bobId, delta: 2 });
    const { leaderboard } = await second;

    const alice = leaderboard.find((e) => e.playerId === aliceId);
    const bob = leaderboard.find((e) => e.playerId === bobId);

    expect(alice?.rank).toBe(1);
    expect(alice?.isTied).toBe(true);
    expect(bob?.rank).toBe(1);
    expect(bob?.isTied).toBe(true);
  });

  it("cumulative awards across multiple rounds update the leaderboard correctly", async () => {
    const { host, roomCode } = await openRoom();
    const { playerId } = await joinPlayer(roomCode, "Alice");

    for (let i = 0; i < 3; i++) {
      const update = waitForEvent<ScoreUpdatePayload>(host, "score_update");
      host.emit("award_points", { playerId, delta: 2 });
      await update;
    }

    const final = waitForEvent<ScoreUpdatePayload>(host, "score_update");
    host.emit("award_points", { playerId, delta: 1 });
    const { leaderboard } = await final;

    const alice = leaderboard.find((e) => e.playerId === playerId);
    expect(alice?.score).toBe(7); // 3×2 + 1
    expect(alice?.rank).toBe(1);
  });

  it("score_update from advance_queue includes a leaderboard", async () => {
    const { host, roomCode } = await openRoom();
    const { playerId } = await joinPlayer(roomCode, "Alice");

    host.emit("open_buzz", { buzzMode: "button" });
    await waitForEvent(host, "round_opened");

    const buzzed = waitForEvent(host, "buzz_order_updated");
    const t = Date.now();
    const playerSocket = clients[clients.length - 1]!;
    playerSocket.emit("buzz", {
      mode: "button",
      localTime: t,
      adjustedTime: t,
    });
    await buzzed;

    const scoreUp = waitForEvent<ScoreUpdatePayload>(host, "score_update");
    host.emit("advance_queue", { result: "correct", points: 2 });
    const { leaderboard } = await scoreUp;

    expect(leaderboard.length).toBeGreaterThan(0);
    const alice = leaderboard.find((e) => e.playerId === playerId);
    expect(alice?.score).toBe(2);
    expect(alice?.rank).toBe(1);
  });
});
