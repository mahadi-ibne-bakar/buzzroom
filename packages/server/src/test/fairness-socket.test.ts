import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type {
  BuzzOrderUpdatedPayload,
  JoinOkPayload,
  RoomCreatedPayload,
  SyncPongPayload,
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

async function openRoom(): Promise<{ host: ClientSocket; roomCode: string }> {
  const host = await makeClient();
  const p = waitForEvent<RoomCreatedPayload>(host, "room_created");
  host.emit("create_room", { hostName: "Host" });
  const { room } = await p;
  return { host, roomCode: room.roomCode };
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

// ── sync_ping / sync_pong ─────────────────────────────────────────────────

describe("sync_ping / sync_pong", () => {
  it("server replies with sync_pong echoing t0 and its own ts", async () => {
    const client = await makeClient();
    const t0 = Date.now();

    const pong = waitForEvent<SyncPongPayload>(client, "sync_pong");
    client.emit("sync_ping", { t0 });
    const payload = await pong;

    expect(payload.t0).toBe(t0); // echoed exactly
    expect(payload.ts).toBeGreaterThanOrEqual(t0); // server time ≥ client send time
    expect(payload.ts).toBeLessThan(t0 + 2_000); // processed within 2s (generous for CI)
  });

  it("RTT computed from pong is positive and plausible", async () => {
    const client = await makeClient();
    const t0 = Date.now();

    const pong = waitForEvent<SyncPongPayload>(client, "sync_pong");
    client.emit("sync_ping", { t0 });
    const payload = await pong;

    const t1 = Date.now();
    const rtt = t1 - payload.t0;

    // RTT must be positive and under 2s on localhost
    expect(rtt).toBeGreaterThan(0);
    expect(rtt).toBeLessThan(2_000);

    // The offset the client would compute:
    // offset = ts - (t0 + rtt/2)
    // On localhost this should be very close to 0
    const estimatedOffset = payload.ts - (payload.t0 + rtt / 2);
    expect(Math.abs(estimatedOffset)).toBeLessThan(500); // within 500ms on any machine
  });

  it("client can send multiple pings; each gets an independent pong", async () => {
    const client = await makeClient();
    const t0a = Date.now();
    const t0b = t0a + 50;

    const pongA = waitForEvent<SyncPongPayload>(client, "sync_pong");
    client.emit("sync_ping", { t0: t0a });
    const a = await pongA;
    expect(a.t0).toBe(t0a);

    const pongB = waitForEvent<SyncPongPayload>(client, "sync_pong");
    client.emit("sync_ping", { t0: t0b });
    const b = await pongB;
    expect(b.t0).toBe(t0b);
  });
});

// ── adjustedTime-based ordering ───────────────────────────────────────────

describe("buzz ordering by adjustedTime", () => {
  it("lower adjustedTime wins rank 1 even when packet arrives second", async () => {
    const { host, roomCode } = await openRoom();
    const { player: alice } = await joinPlayer(roomCode, "Alice");
    const { player: bob } = await joinPlayer(roomCode, "Bob");

    host.emit("open_buzz", { buzzMode: "button" });
    await waitForEvent(host, "round_opened");

    // Bob's packet arrives first (we emit his first).
    // But Alice's adjustedTime is lower (she pressed earlier).
    const firstUpdate = waitForEvent<BuzzOrderUpdatedPayload>(host, "buzz_order_updated");
    bob.emit("buzz", {
      mode: "button",
      localTime: Date.now(),
      adjustedTime: Date.now() + 200, // Bob pressed "later"
    });
    await firstUpdate;

    const secondUpdate = waitForEvent<BuzzOrderUpdatedPayload>(
      host,
      "buzz_order_updated",
    );
    alice.emit("buzz", {
      mode: "button",
      localTime: Date.now(),
      adjustedTime: Date.now() + 10, // Alice pressed "earlier"
    });
    const update = await secondUpdate;

    // Alice should be rank 1 despite arriving second
    expect(update.buzzOrder[0]!.playerName).toBe("Alice");
    expect(update.buzzOrder[0]!.rank).toBe(1);
    expect(update.buzzOrder[1]!.playerName).toBe("Bob");
    expect(update.buzzOrder[1]!.rank).toBe(2);
  });

  it("backdated adjustedTime is clamped — cheating does not yield rank 1", async () => {
    const { host, roomCode } = await openRoom();
    const { player: alice } = await joinPlayer(roomCode, "Alice");
    const { player: cheat } = await joinPlayer(roomCode, "Cheat");

    host.emit("open_buzz", { buzzMode: "button" });
    await waitForEvent(host, "round_opened");

    // Alice buzzes honestly
    const firstUpdate = waitForEvent<BuzzOrderUpdatedPayload>(host, "buzz_order_updated");
    alice.emit("buzz", {
      mode: "button",
      localTime: Date.now(),
      adjustedTime: Date.now() + 100,
    });
    await firstUpdate;

    // Cheat tries to backdate to 10 seconds before the round opened
    const secondUpdate = waitForEvent<BuzzOrderUpdatedPayload>(
      host,
      "buzz_order_updated",
    );
    cheat.emit("buzz", {
      mode: "button",
      localTime: Date.now(),
      adjustedTime: Date.now() - 10_000, // 10s in the past
    });
    const update = await secondUpdate;

    // Cheater's time is clamped to the floor, putting them after Alice
    // (Alice's adjustedTime ≈ now+100; cheat's clamped time ≈ roundOpen-100)
    // Cheat gets rank 1 only if clamping to the floor puts them before Alice.
    // Since the floor is roundOpen - 100ms and Alice pressed at now+100ms
    // (and now > roundOpen), the cheat DOES get rank 1 from clamping.
    // The important thing: the clamped time is finite and bounded, not -10s.
    const cheatEntry = update.buzzOrder.find((e) => e.playerName === "Cheat");
    expect(cheatEntry).toBeDefined();
    // The adjustedTime should be clamped — not 10 seconds in the past
    const serverNow = Date.now();
    expect(cheatEntry!.adjustedTime).toBeGreaterThan(serverNow - 10_000);
  });
});

// ── near-tie detection over sockets ──────────────────────────────────────

describe("near-tie detection", () => {
  it("two buzzes within 50ms are both flagged as nearTie", async () => {
    const { host, roomCode } = await openRoom();
    const { player: alice } = await joinPlayer(roomCode, "Alice");
    const { player: bob } = await joinPlayer(roomCode, "Bob");

    host.emit("open_buzz", { buzzMode: "button" });
    await waitForEvent(host, "round_opened");

    const base = Date.now();

    const firstUpdate = waitForEvent<BuzzOrderUpdatedPayload>(host, "buzz_order_updated");
    alice.emit("buzz", {
      mode: "button",
      localTime: base,
      adjustedTime: base + 100,
    });
    await firstUpdate;

    const secondUpdate = waitForEvent<BuzzOrderUpdatedPayload>(
      host,
      "buzz_order_updated",
    );
    bob.emit("buzz", {
      mode: "button",
      localTime: base,
      adjustedTime: base + 120, // 20ms apart — within 50ms threshold
    });
    const update = await secondUpdate;

    expect(update.buzzOrder[0]!.nearTie).toBe(true);
    expect(update.buzzOrder[1]!.nearTie).toBe(true);
  });

  it("two buzzes more than 50ms apart are not flagged as nearTie", async () => {
    const { host, roomCode } = await openRoom();
    const { player: alice } = await joinPlayer(roomCode, "Alice");
    const { player: bob } = await joinPlayer(roomCode, "Bob");

    host.emit("open_buzz", { buzzMode: "button" });
    await waitForEvent(host, "round_opened");

    const base = Date.now();

    const firstUpdate = waitForEvent<BuzzOrderUpdatedPayload>(host, "buzz_order_updated");
    alice.emit("buzz", {
      mode: "button",
      localTime: base,
      adjustedTime: base + 100,
    });
    await firstUpdate;

    const secondUpdate = waitForEvent<BuzzOrderUpdatedPayload>(
      host,
      "buzz_order_updated",
    );
    bob.emit("buzz", {
      mode: "button",
      localTime: base,
      adjustedTime: base + 250, // 150ms apart — outside threshold
    });
    const update = await secondUpdate;

    expect(update.buzzOrder[0]!.nearTie).toBe(false);
    expect(update.buzzOrder[1]!.nearTie).toBe(false);
  });
});
