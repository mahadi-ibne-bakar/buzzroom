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

function waitForConnect(s: ClientSocket): Promise<void> {
  return new Promise((res, rej) => {
    if (s.connected) {
      res();
      return;
    }
    s.once("connect", res);
    s.once("connect_error", rej);
  });
}
function waitForEvent<T>(s: ClientSocket, event: string): Promise<T> {
  return new Promise((res) => s.once(event, (p: T) => res(p)));
}

// Collects exactly `n` occurrences of `event` and returns the last payload.
// Registers the listener BEFORE any emits, so there is no window between
// "await first event" and "register for second event" where the second
// could silently arrive and be missed.
function collectN<T>(s: ClientSocket, event: string, n: number): Promise<T> {
  return new Promise((resolve) => {
    let count = 0;
    const handler = (payload: T) => {
      count++;
      if (count === n) {
        s.off(event, handler);
        resolve(payload);
      }
    };
    s.on(event, handler);
  });
}

let port: number;
let stopServer: () => void;
const clients: ClientSocket[] = [];

beforeEach(async () => {
  const { httpServer, io } = createServer({ clientOrigin: "*" });
  await new Promise<void>((res) => httpServer.listen(0, res));
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

// ── sync_ping / sync_pong ─────────────────────────────────────────────────

describe("sync_ping / sync_pong", () => {
  it("server echoes t0 and adds its own ts", async () => {
    const client = await makeClient();
    const t0 = Date.now();
    const pong = waitForEvent<SyncPongPayload>(client, "sync_pong");
    client.emit("sync_ping", { t0 });
    const p = await pong;
    expect(p.t0).toBe(t0);
    expect(p.ts).toBeGreaterThanOrEqual(t0);
    expect(p.ts).toBeLessThan(t0 + 2_000);
  });

  it("RTT computed from pong is non-negative and plausible", async () => {
    const client = await makeClient();
    const t0 = Date.now();
    const pong = waitForEvent<SyncPongPayload>(client, "sync_pong");
    client.emit("sync_ping", { t0 });
    const p = await pong;
    const t1 = Date.now();
    // Date.now() has millisecond resolution and this round trip is over
    // loopback, so a genuine RTT of 0 is normal -- asserting > 0 here made
    // the test flaky. What matters is that time never runs backwards and
    // the round trip stays within a sane bound.
    expect(t1 - p.t0).toBeGreaterThanOrEqual(0);
    expect(t1 - p.t0).toBeLessThan(2_000);
  });
});

// ── adjustedTime-based ordering ───────────────────────────────────────────

describe("buzz ordering by adjustedTime", () => {
  it("lower adjustedTime wins rank 1 even when packet arrives second", async () => {
    const host = await makeClient();
    const rc = waitForEvent<RoomCreatedPayload>(host, "room_created");
    host.emit("create_room", { hostName: "Host" });
    const { room } = await rc;

    const alice = await makeClient();
    const bob = await makeClient();

    const jo1 = waitForEvent<JoinOkPayload>(alice, "join_ok");
    alice.emit("join_room", { roomCode: room.roomCode, playerName: "Alice" });
    await jo1;

    const jo2 = waitForEvent<JoinOkPayload>(bob, "join_ok");
    bob.emit("join_room", { roomCode: room.roomCode, playerName: "Bob" });
    await jo2;

    host.emit("open_buzz", { buzzMode: "button" });
    await waitForEvent(host, "round_opened");

    // Register for BOTH updates before either buzz is emitted.
    // This eliminates the race where Alice's packet could arrive and fire
    // the second event before we get a chance to attach a .once() listener.
    const bothBuzzed = collectN<BuzzOrderUpdatedPayload>(
      host,
      "buzz_order_updated",
      2,
    );

    const base = Date.now();
    // Bob's packet arrives first but his adjustedTime is higher (pressed later)
    bob.emit("buzz", {
      mode: "button",
      localTime: base,
      adjustedTime: base + 200,
    });
    // Alice's packet arrives second but her adjustedTime is lower (pressed earlier)
    alice.emit("buzz", {
      mode: "button",
      localTime: base,
      adjustedTime: base + 10,
    });

    const update = await bothBuzzed;

    expect(update.buzzOrder[0]!.playerName).toBe("Alice");
    expect(update.buzzOrder[0]!.rank).toBe(1);
    expect(update.buzzOrder[1]!.playerName).toBe("Bob");
  });

  it("backdated adjustedTime is clamped — cheating does not give an unfair advantage", async () => {
    const host = await makeClient();
    const rc = waitForEvent<RoomCreatedPayload>(host, "room_created");
    host.emit("create_room", { hostName: "Host" });
    const { room } = await rc;

    const alice = await makeClient();
    const cheat = await makeClient();

    const jo1 = waitForEvent<JoinOkPayload>(alice, "join_ok");
    alice.emit("join_room", { roomCode: room.roomCode, playerName: "Alice" });
    await jo1;

    const jo2 = waitForEvent<JoinOkPayload>(cheat, "join_ok");
    cheat.emit("join_room", { roomCode: room.roomCode, playerName: "Cheat" });
    await jo2;

    host.emit("open_buzz", { buzzMode: "button" });
    await waitForEvent(host, "round_opened");

    const bothBuzzed = collectN<BuzzOrderUpdatedPayload>(
      host,
      "buzz_order_updated",
      2,
    );

    alice.emit("buzz", {
      mode: "button",
      localTime: Date.now(),
      adjustedTime: Date.now() + 100,
    });
    // Cheat claims to have buzzed 10 seconds ago
    cheat.emit("buzz", {
      mode: "button",
      localTime: Date.now(),
      adjustedTime: Date.now() - 10_000,
    });

    const update = await bothBuzzed;

    const cheatEntry = update.buzzOrder.find((e) => e.playerName === "Cheat");
    expect(cheatEntry).toBeDefined();
    // The adjustedTime must be clamped — never 10 seconds in the past
    expect(cheatEntry!.adjustedTime).toBeGreaterThan(Date.now() - 10_000);
  });
});

// ── near-tie detection ────────────────────────────────────────────────────

describe("near-tie detection", () => {
  it("two buzzes within 50ms are both flagged as nearTie", async () => {
    const host = await makeClient();
    const rc = waitForEvent<RoomCreatedPayload>(host, "room_created");
    host.emit("create_room", { hostName: "Host" });
    const { room } = await rc;

    const alice = await makeClient();
    const bob = await makeClient();

    const jo1 = waitForEvent<JoinOkPayload>(alice, "join_ok");
    alice.emit("join_room", { roomCode: room.roomCode, playerName: "Alice" });
    await jo1;

    const jo2 = waitForEvent<JoinOkPayload>(bob, "join_ok");
    bob.emit("join_room", { roomCode: room.roomCode, playerName: "Bob" });
    await jo2;

    host.emit("open_buzz", { buzzMode: "button" });
    await waitForEvent(host, "round_opened");

    const bothBuzzed = collectN<BuzzOrderUpdatedPayload>(
      host,
      "buzz_order_updated",
      2,
    );

    const base = Date.now();
    alice.emit("buzz", {
      mode: "button",
      localTime: base,
      adjustedTime: base + 100,
    });
    bob.emit("buzz", {
      mode: "button",
      localTime: base,
      adjustedTime: base + 120,
    }); // 20ms apart

    const update = await bothBuzzed;

    expect(update.buzzOrder[0]!.nearTie).toBe(true);
    expect(update.buzzOrder[1]!.nearTie).toBe(true);
  });

  it("two buzzes more than 50ms apart are NOT flagged as nearTie", async () => {
    const host = await makeClient();
    const rc = waitForEvent<RoomCreatedPayload>(host, "room_created");
    host.emit("create_room", { hostName: "Host" });
    const { room } = await rc;

    const alice = await makeClient();
    const bob = await makeClient();

    const jo1 = waitForEvent<JoinOkPayload>(alice, "join_ok");
    alice.emit("join_room", { roomCode: room.roomCode, playerName: "Alice" });
    await jo1;

    const jo2 = waitForEvent<JoinOkPayload>(bob, "join_ok");
    bob.emit("join_room", { roomCode: room.roomCode, playerName: "Bob" });
    await jo2;

    host.emit("open_buzz", { buzzMode: "button" });
    await waitForEvent(host, "round_opened");

    const bothBuzzed = collectN<BuzzOrderUpdatedPayload>(
      host,
      "buzz_order_updated",
      2,
    );

    const base = Date.now();
    alice.emit("buzz", {
      mode: "button",
      localTime: base,
      adjustedTime: base + 100,
    });
    bob.emit("buzz", {
      mode: "button",
      localTime: base,
      adjustedTime: base + 250,
    }); // 150ms apart

    const update = await bothBuzzed;

    expect(update.buzzOrder[0]!.nearTie).toBe(false);
    expect(update.buzzOrder[1]!.nearTie).toBe(false);
  });
});
