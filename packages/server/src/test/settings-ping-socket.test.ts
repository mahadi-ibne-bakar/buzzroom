import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type {
  BuzzOrderUpdatedPayload,
  JoinOkPayload,
  PingUpdatePayload,
  RoomCreatedPayload,
  RoundOpenedPayload,
  ServerErrorPayload,
  SettingsUpdatedPayload,
  SyncPongPayload,
  WatchOkPayload,
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

async function openRoom() {
  const host = await makeClient();
  const p = waitForEvent<RoomCreatedPayload>(host, "room_created");
  host.emit("create_room", { hostName: "Host" });
  const { room, yourPlayerId } = await p;
  return { host, room, roomCode: room.roomCode, hostPlayerId: yourPlayerId };
}

async function joinPlayer(roomCode: string, name: string) {
  const player = await makeClient();
  const p = waitForEvent<JoinOkPayload>(player, "join_ok");
  player.emit("join_room", { roomCode, playerName: name });
  const { yourPlayerId, room } = await p;
  return { player, playerId: yourPlayerId, room };
}

// ── settings ──────────────────────────────────────────────────────────────

describe("room settings", () => {
  it("defaults to a locked window, penalty on, teams off", async () => {
    const { room } = await openRoom();
    expect(room.settings).toEqual({
      buzzWindowMode: "locked",
      earlyBuzzPenalty: true,
      teamsEnabled: false,
      audienceVoting: false,
    });
  });

  it("broadcasts a host settings change to the whole room", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    const updated = waitForEvent<SettingsUpdatedPayload>(
      player,
      "settings_updated",
    );
    host.emit("update_settings", { buzzWindowMode: "free" });

    expect((await updated).settings.buzzWindowMode).toBe("free");
  });

  it("leaves unmentioned settings alone", async () => {
    const { host } = await openRoom();

    const updated = waitForEvent<SettingsUpdatedPayload>(
      host,
      "settings_updated",
    );
    host.emit("update_settings", { buzzWindowMode: "free" });

    expect((await updated).settings.earlyBuzzPenalty).toBe(true);
  });

  it("refuses a settings change from a non-host", async () => {
    const { roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    const err = waitForEvent<ServerErrorPayload>(player, "server_error");
    player.emit("update_settings", { buzzWindowMode: "free" });

    expect((await err).code).toBe("UNAUTHORIZED");
  });

  it("applies a window mode carried on open_buzz", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    const updated = waitForEvent<SettingsUpdatedPayload>(
      player,
      "settings_updated",
    );
    host.emit("open_buzz", { buzzMode: "button", buzzWindowMode: "free" });

    expect((await updated).settings.buzzWindowMode).toBe("free");
  });

  it("carries the current settings on a fresh join", async () => {
    const { host, roomCode } = await openRoom();
    const settled = waitForEvent<SettingsUpdatedPayload>(
      host,
      "settings_updated",
    );
    host.emit("update_settings", { buzzWindowMode: "free" });
    await settled;

    const { room } = await joinPlayer(roomCode, "Alice");
    expect(room.settings.buzzWindowMode).toBe("free");
  });
});

// ── free buzz ─────────────────────────────────────────────────────────────

describe("free buzz window", () => {
  it("opens a round on the first buzz when the host has opened nothing", async () => {
    const { host, roomCode } = await openRoom();
    const { player, playerId } = await joinPlayer(roomCode, "Alice");

    const settled = waitForEvent<SettingsUpdatedPayload>(
      host,
      "settings_updated",
    );
    host.emit("update_settings", { buzzWindowMode: "free" });
    await settled;

    // No open_buzz at any point -- this is the "buzz before the host opens
    // it" case the mode exists for.
    const opened = waitForEvent<RoundOpenedPayload>(host, "round_opened");
    const ordered = waitForEvent<BuzzOrderUpdatedPayload>(
      host,
      "buzz_order_updated",
    );
    const t = Date.now();
    player.emit("buzz", { mode: "button", localTime: t, adjustedTime: t });

    expect((await opened).round.modeParams.mode).toBe("button");
    const { buzzOrder } = await ordered;
    expect(buzzOrder).toHaveLength(1);
    expect(buzzOrder[0]!.playerId).toBe(playerId);
  });

  it("still refuses a buzz with no round when locked", async () => {
    const { roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    const err = waitForEvent<ServerErrorPayload>(player, "server_error");
    const t = Date.now();
    player.emit("buzz", { mode: "button", localTime: t, adjustedTime: t });

    expect((await err).code).toBe("NO_ACTIVE_ROUND");
  });

  it("accepts a buzz after the host closes the window", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    const opened = waitForEvent<RoundOpenedPayload>(player, "round_opened");
    host.emit("open_buzz", { buzzMode: "button", buzzWindowMode: "free" });
    await opened;

    const closed = waitForEvent<void>(player, "round_closed");
    host.emit("close_buzz");
    await closed;

    const ordered = waitForEvent<BuzzOrderUpdatedPayload>(
      host,
      "buzz_order_updated",
    );
    const t = Date.now();
    player.emit("buzz", { mode: "button", localTime: t, adjustedTime: t });

    expect((await ordered).buzzOrder).toHaveLength(1);
  });

  it("penalises the same buzz when the window is locked", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    const opened = waitForEvent<RoundOpenedPayload>(player, "round_opened");
    host.emit("open_buzz", { buzzMode: "button", buzzWindowMode: "locked" });
    await opened;

    const closed = waitForEvent<void>(player, "round_closed");
    host.emit("close_buzz");
    await closed;

    const penalty = waitForEvent<{ lockedForMs: number }>(
      player,
      "early_buzz_penalty",
    );
    const t = Date.now();
    player.emit("buzz", { mode: "button", localTime: t, adjustedTime: t });

    expect((await penalty).lockedForMs).toBeGreaterThan(0);
  });
});

// ── connection quality ────────────────────────────────────────────────────

describe("ping_update", () => {
  it("reports null until a player has reported an RTT", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    const update = waitForEvent<PingUpdatePayload>(host, "ping_update");
    player.emit("sync_ping", { t0: Date.now() });

    const { pings } = await update;
    expect(pings).toHaveLength(2);
    expect(pings.every((p) => p.rttMs === null)).toBe(true);
  });

  it("fans out the RTT a player reports on its next ping", async () => {
    const { host, roomCode } = await openRoom();
    const { player, playerId } = await joinPlayer(roomCode, "Alice");

    // First ping establishes a measurement the client would make locally.
    const pong = waitForEvent<SyncPongPayload>(player, "sync_pong");
    player.emit("sync_ping", { t0: Date.now() });
    await pong;

    // The throttle means the next broadcast has to wait out the interval.
    await new Promise((r) => setTimeout(r, 2_100));

    const update = waitForEvent<PingUpdatePayload>(host, "ping_update");
    player.emit("sync_ping", { t0: Date.now(), lastRtt: 42 });

    const { pings } = await update;
    expect(pings.find((p) => p.playerId === playerId)!.rttMs).toBe(42);
  });

  it("coalesces broadcasts rather than emitting one per ping", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    let broadcasts = 0;
    host.on("ping_update", () => broadcasts++);

    for (let i = 0; i < 5; i++) {
      const pong = waitForEvent<SyncPongPayload>(player, "sync_pong");
      player.emit("sync_ping", { t0: Date.now(), lastRtt: 10 + i });
      await pong;
    }
    await new Promise((r) => setTimeout(r, 100));

    expect(broadcasts).toBe(1);
  });

  it("surfaces the reported RTT on the player views a joiner receives", async () => {
    const { roomCode } = await openRoom();
    const { player, playerId } = await joinPlayer(roomCode, "Alice");

    const pong = waitForEvent<SyncPongPayload>(player, "sync_pong");
    player.emit("sync_ping", { t0: Date.now(), lastRtt: 17 });
    await pong;

    const { room } = await joinPlayer(roomCode, "Bob");
    expect(room.players.find((p) => p.playerId === playerId)!.rttMs).toBe(17);
  });
});

// ── presenter view ────────────────────────────────────────────────────────

describe("watch_room", () => {
  it("sends a full snapshot including the current leaderboard", async () => {
    // score_update only fires when a score changes, so a presenter attaching
    // mid-game has to get the board in the watch_ok itself.
    const { host, roomCode } = await openRoom();
    const { playerId } = await joinPlayer(roomCode, "Alice");
    const scored = waitForEvent<SettingsUpdatedPayload>(host, "score_update");
    host.emit("award_points", { playerId, delta: 4 });
    await scored;

    const presenter = await makeClient();
    const ok = waitForEvent<WatchOkPayload>(presenter, "watch_ok");
    presenter.emit("watch_room", { roomCode });

    const { room, leaderboard } = await ok;
    expect(room.roomCode).toBe(roomCode);
    expect(leaderboard.find((e) => e.playerId === playerId)!.score).toBe(4);
  });

  it("takes no seat in the room", async () => {
    const { roomCode } = await openRoom();

    const presenter = await makeClient();
    const ok = waitForEvent<WatchOkPayload>(presenter, "watch_ok");
    presenter.emit("watch_room", { roomCode });
    await ok;

    // Only the host. A presenter must not consume a player slot or show up
    // on the leaderboard.
    const { room } = await joinPlayer(roomCode, "Alice");
    expect(room.players).toHaveLength(2);
  });

  it("receives the room's live broadcasts", async () => {
    const { host, roomCode } = await openRoom();
    const presenter = await makeClient();
    const ok = waitForEvent<WatchOkPayload>(presenter, "watch_ok");
    presenter.emit("watch_room", { roomCode });
    await ok;

    const opened = waitForEvent<RoundOpenedPayload>(presenter, "round_opened");
    host.emit("open_buzz", { buzzMode: "button" });

    expect((await opened).round.status).toBe("open");
  });

  it("does not announce a player_left when it disconnects", async () => {
    const { host, roomCode } = await openRoom();
    const presenter = await makeClient();
    const ok = waitForEvent<WatchOkPayload>(presenter, "watch_ok");
    presenter.emit("watch_room", { roomCode });
    await ok;

    let sawLeft = false;
    host.on("player_left", () => {
      sawLeft = true;
    });
    presenter.close();
    await new Promise((r) => setTimeout(r, 200));

    expect(sawLeft).toBe(false);
  });

  it("rejects an unknown room code", async () => {
    const presenter = await makeClient();
    const err = waitForEvent<ServerErrorPayload>(presenter, "server_error");
    presenter.emit("watch_room", { roomCode: "ZZZZZZ" });

    expect((await err).code).toBe("ROOM_NOT_FOUND");
  });
});
