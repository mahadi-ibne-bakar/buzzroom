import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type {
  BuzzOrderUpdatedPayload,
  JoinOkPayload,
  ReconnectOkPayload,
  RoomCreatedPayload,
  RoundOpenedPayload,
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

/** Opens a round in the given mode and returns the broadcast round view. */
async function openRound(
  host: ClientSocket,
  player: ClientSocket,
  buzzMode: "button" | "slide" | "pattern",
) {
  const opened = waitForEvent<RoundOpenedPayload>(player, "round_opened");
  host.emit("open_buzz", { buzzMode });
  return (await opened).round;
}

// ── mode params generation ────────────────────────────────────────────────

describe("open_buzz mode params", () => {
  it("broadcasts a bare button mode with no token", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    const round = await openRound(host, player, "button");

    expect(round.modeParams).toEqual({ mode: "button" });
  });

  it("broadcasts a token for slide rounds", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    const round = await openRound(host, player, "slide");

    expect(round.modeParams.mode).toBe("slide");
    expect(
      round.modeParams.mode === "slide" && round.modeParams.token,
    ).toBeTruthy();
  });

  it("broadcasts a token and an in-range sequence for pattern rounds", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    const round = await openRound(host, player, "pattern");

    expect(round.modeParams.mode).toBe("pattern");
    if (round.modeParams.mode !== "pattern") throw new Error("wrong mode");

    const { token, sequence } = round.modeParams;
    expect(token).toBeTruthy();
    // Must stay inside the range BuzzPayloadSchema accepts.
    expect(sequence.length).toBeGreaterThanOrEqual(3);
    expect(sequence.length).toBeLessThanOrEqual(9);
    for (const dot of sequence) {
      expect(dot).toBeGreaterThanOrEqual(0);
      expect(dot).toBeLessThanOrEqual(8);
    }
    // A lock pattern never revisits a dot.
    expect(new Set(sequence).size).toBe(sequence.length);
  });

  it("issues a fresh token on every open, so a gesture can't be pre-practised", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    const first = await openRound(host, player, "slide");
    const second = await openRound(host, player, "slide");

    expect(first.modeParams.mode).toBe("slide");
    expect(second.modeParams.mode).toBe("slide");
    if (first.modeParams.mode !== "slide") throw new Error("wrong mode");
    if (second.modeParams.mode !== "slide") throw new Error("wrong mode");
    expect(second.modeParams.token).not.toBe(first.modeParams.token);
  });
});

// ── gesture credentials ───────────────────────────────────────────────────

describe("buzz gesture credentials", () => {
  it("accepts a slide buzz carrying the round's token", async () => {
    const { host, roomCode } = await openRoom();
    const { player, playerId } = await joinPlayer(roomCode, "Alice");
    const round = await openRound(host, player, "slide");
    if (round.modeParams.mode !== "slide") throw new Error("wrong mode");

    const updated = waitForEvent<BuzzOrderUpdatedPayload>(
      host,
      "buzz_order_updated",
    );
    const t = Date.now();
    player.emit("buzz", {
      mode: "slide",
      token: round.modeParams.token,
      localTime: t,
      adjustedTime: t,
    });

    const { buzzOrder } = await updated;
    expect(buzzOrder).toHaveLength(1);
    expect(buzzOrder[0]!.playerId).toBe(playerId);
    expect(buzzOrder[0]!.mode).toBe("slide");
  });

  it("rejects a slide buzz with a token from a previous round", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");
    const stale = await openRound(host, player, "slide");
    if (stale.modeParams.mode !== "slide") throw new Error("wrong mode");
    await openRound(host, player, "slide"); // re-opens with a new token

    const err = waitForEvent<ServerErrorPayload>(player, "server_error");
    const t = Date.now();
    player.emit("buzz", {
      mode: "slide",
      token: stale.modeParams.token,
      localTime: t,
      adjustedTime: t,
    });

    expect((await err).code).toBe("VALIDATION_ERROR");
  });

  it("rejects a buzz whose mode is not the round's mode", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");
    await openRound(host, player, "slide");

    // A player who skipped the slide and emitted a plain button buzz.
    const err = waitForEvent<ServerErrorPayload>(player, "server_error");
    const t = Date.now();
    player.emit("buzz", { mode: "button", localTime: t, adjustedTime: t });

    expect((await err).code).toBe("VALIDATION_ERROR");
  });

  it("rejects a pattern buzz that traced the wrong sequence", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");
    const round = await openRound(host, player, "pattern");
    if (round.modeParams.mode !== "pattern") throw new Error("wrong mode");

    // Same dots, reversed — right length, right token, wrong gesture.
    const wrong = [...round.modeParams.sequence].reverse();
    const err = waitForEvent<ServerErrorPayload>(player, "server_error");
    const t = Date.now();
    player.emit("buzz", {
      mode: "pattern",
      token: round.modeParams.token,
      sequence: wrong,
      localTime: t,
      adjustedTime: t,
    });

    expect((await err).code).toBe("VALIDATION_ERROR");
  });

  it("accepts a pattern buzz that traced the round's sequence", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");
    const round = await openRound(host, player, "pattern");
    if (round.modeParams.mode !== "pattern") throw new Error("wrong mode");

    const updated = waitForEvent<BuzzOrderUpdatedPayload>(
      host,
      "buzz_order_updated",
    );
    const t = Date.now();
    player.emit("buzz", {
      mode: "pattern",
      token: round.modeParams.token,
      sequence: round.modeParams.sequence,
      localTime: t,
      adjustedTime: t,
    });

    const { buzzOrder } = await updated;
    expect(buzzOrder).toHaveLength(1);
    expect(buzzOrder[0]!.mode).toBe("pattern");
  });
});

// ── disconnect & reconnect ────────────────────────────────────────────────

describe("reconnect_room", () => {
  it("restores a player onto their seat with their score intact", async () => {
    const { host, roomCode } = await openRoom();
    const { player, playerId } = await joinPlayer(roomCode, "Alice");

    const scored = waitForEvent<ScoreUpdatePayload>(host, "score_update");
    host.emit("award_points", { playerId, delta: 5 });
    await scored;

    player.close();

    const back = await makeClient();
    const ok = waitForEvent<ReconnectOkPayload>(back, "reconnect_ok");
    back.emit("reconnect_room", { playerId, roomCode });

    const { room, yourPlayerId } = await ok;
    expect(yourPlayerId).toBe(playerId);
    const me = room.players.find((p) => p.playerId === playerId);
    expect(me!.score).toBe(5);
    expect(me!.isConnected).toBe(true);
  });

  it("lets a reconnected host keep driving the round", async () => {
    // getHostRoom() authorises on socket.id, so the store has to move
    // hostSocketId across on reconnect or the host loses their own game.
    const { host, roomCode, hostPlayerId } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    host.close();

    const back = await makeClient();
    const ok = waitForEvent<ReconnectOkPayload>(back, "reconnect_ok");
    back.emit("reconnect_room", { playerId: hostPlayerId, roomCode });
    await ok;

    const opened = waitForEvent<RoundOpenedPayload>(player, "round_opened");
    back.emit("open_buzz", { buzzMode: "button" });

    expect((await opened).round.status).toBe("open");
  });

  it("keeps a buzz submitted before the disconnect", async () => {
    const { host, roomCode } = await openRoom();
    const { player, playerId } = await joinPlayer(roomCode, "Alice");
    await openRound(host, player, "button");

    const updated = waitForEvent<BuzzOrderUpdatedPayload>(
      host,
      "buzz_order_updated",
    );
    const t = Date.now();
    player.emit("buzz", { mode: "button", localTime: t, adjustedTime: t });
    await updated;

    player.close();

    const back = await makeClient();
    const ok = waitForEvent<ReconnectOkPayload>(back, "reconnect_ok");
    back.emit("reconnect_room", { playerId, roomCode });

    const { room } = await ok;
    expect(room.round!.buzzOrder.map((e) => e.playerId)).toContain(playerId);
  });

  it("rejects a stale session whose room is gone", async () => {
    const { roomCode } = await openRoom();
    const badPlayerId = "00000000-0000-4000-8000-000000000000";

    const client = await makeClient();
    const err = waitForEvent<ServerErrorPayload>(client, "server_error");
    client.emit("reconnect_room", { playerId: badPlayerId, roomCode });

    expect((await err).code).toBe("ROOM_NOT_FOUND");
  });
});

describe("host_left", () => {
  it("is broadcast to the room when the host drops", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    const gone = waitForEvent<void>(player, "host_left");
    host.close();
    await gone;
  });

  it("is not broadcast when an ordinary player drops", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");
    const { player: other } = await joinPlayer(roomCode, "Bob");

    let hostLeft = false;
    other.on("host_left", () => {
      hostLeft = true;
    });
    const left = waitForEvent<{ playerId: string }>(other, "player_left");
    player.close();
    await left;

    expect(hostLeft).toBe(false);
    // The host socket is still the one holding the room.
    expect(host.connected).toBe(true);
  });
});

describe("advance_queue", () => {
  it("awards the configured points, once, even if the host taps twice", async () => {
    const { host, roomCode } = await openRoom();
    const { player, playerId } = await joinPlayer(roomCode, "Alice");
    await openRound(host, player, "button");

    const buzzed = waitForEvent<BuzzOrderUpdatedPayload>(
      host,
      "buzz_order_updated",
    );
    const t = Date.now();
    player.emit("buzz", { mode: "button", localTime: t, adjustedTime: t });
    await buzzed;

    const scored = waitForEvent<ScoreUpdatePayload>(host, "score_update");
    host.emit("advance_queue", { result: "correct", points: 3 });
    await scored;

    // Second tap: rejected rather than silently doubling the score.
    const err = waitForEvent<ServerErrorPayload>(host, "server_error");
    host.emit("advance_queue", { result: "correct", points: 3 });
    expect((await err).code).toBe("INVALID_STATE");

    const settled = waitForEvent<ScoreUpdatePayload>(host, "score_update");
    host.emit("award_points", { playerId, delta: 1 });
    const { players } = await settled;
    expect(players.find((p) => p.playerId === playerId)!.score).toBe(4);
  });
});
