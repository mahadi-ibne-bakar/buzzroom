import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type {
  BuzzOrderUpdatedPayload,
  JoinOkPayload,
  RoomCreatedPayload,
  RoundOpenedPayload,
  ServerErrorPayload,
  SettingsUpdatedPayload,
  VoteTallyPayload,
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

/**
 * Waits for a tally with the expected counts.
 *
 * Several tallies are often in flight: an accepted buzz broadcasts one (that
 * is what makes the vote panel appear), and so does every vote and every
 * advance. Waiting for "the next tally" would latch onto whichever arrived
 * first rather than the one under test.
 */
function waitForTally(
  socket: ClientSocket,
  agree: number,
  disagree: number,
): Promise<VoteTallyPayload> {
  return waitForMatching<VoteTallyPayload>(
    socket,
    "vote_tally",
    (p) => p.tally.agree === agree && p.tally.disagree === disagree,
  );
}

function waitForMatching<T>(
  socket: ClientSocket,
  event: string,
  matches: (payload: T) => boolean,
): Promise<T> {
  return new Promise((resolve) => {
    const handler = (payload: T) => {
      if (!matches(payload)) return;
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
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

/**
 * A room with audience voting on, two players, an open button round, and
 * Alice buzzed in first so she is the one being voted on.
 */
async function roomWithActivePlayer() {
  const host = await makeClient();
  const created = waitForEvent<RoomCreatedPayload>(host, "room_created");
  host.emit("create_room", { hostName: "Host" });
  const { room } = await created;
  const roomCode = room.roomCode;

  const settled = waitForEvent<SettingsUpdatedPayload>(
    host,
    "settings_updated",
  );
  host.emit("update_settings", { audienceVoting: true });
  await settled;

  const join = async (name: string) => {
    const player = await makeClient();
    const ok = waitForEvent<JoinOkPayload>(player, "join_ok");
    player.emit("join_room", { roomCode, playerName: name });
    return { player, playerId: (await ok).yourPlayerId };
  };
  const alice = await join("Alice");
  const bob = await join("Bob");

  const opened = waitForEvent<RoundOpenedPayload>(alice.player, "round_opened");
  host.emit("open_buzz", { buzzMode: "button" });
  await opened;

  const ordered = waitForEvent<BuzzOrderUpdatedPayload>(
    host,
    "buzz_order_updated",
  );
  const t = Date.now();
  alice.player.emit("buzz", { mode: "button", localTime: t, adjustedTime: t });
  await ordered;

  return { host, roomCode, alice, bob };
}

// ── tallying ──────────────────────────────────────────────────────────────

describe("audience voting", () => {
  it("broadcasts a tally naming who is being voted on", async () => {
    const { host, alice, bob } = await roomWithActivePlayer();

    const tallied = waitForTally(host, 1, 0);
    bob.player.emit("cast_vote", { vote: "agree" });

    expect((await tallied).tally.activePlayerId).toBe(alice.playerId);
  });

  it("replaces a voter's earlier vote rather than stacking it", async () => {
    const { host, bob } = await roomWithActivePlayer();

    const agreed = waitForTally(host, 1, 0);
    bob.player.emit("cast_vote", { vote: "agree" });
    await agreed;

    // One voter, one vote -- changing your mind is fine, voting twice is not.
    const changed = waitForTally(host, 0, 1);
    bob.player.emit("cast_vote", { vote: "disagree" });
    await changed;
  });

  it("refuses a vote from the player being voted on", async () => {
    const { alice } = await roomWithActivePlayer();

    const err = waitForEvent<ServerErrorPayload>(alice.player, "server_error");
    alice.player.emit("cast_vote", { vote: "agree" });

    expect((await err).code).toBe("INVALID_STATE");
  });

  it("refuses a vote when nobody has been called on", async () => {
    const host = await makeClient();
    const created = waitForEvent<RoomCreatedPayload>(host, "room_created");
    host.emit("create_room", { hostName: "Host" });
    const { room } = await created;

    const settled = waitForEvent<SettingsUpdatedPayload>(
      host,
      "settings_updated",
    );
    host.emit("update_settings", { audienceVoting: true });
    await settled;

    const player = await makeClient();
    const ok = waitForEvent<JoinOkPayload>(player, "join_ok");
    player.emit("join_room", {
      roomCode: room.roomCode,
      playerName: "Alice",
    });
    await ok;

    const err = waitForEvent<ServerErrorPayload>(player, "server_error");
    player.emit("cast_vote", { vote: "agree" });

    expect((await err).code).toBe("NO_ACTIVE_ROUND");
  });

  it("refuses a vote while the setting is off", async () => {
    const { host, bob } = await roomWithActivePlayer();
    const settled = waitForEvent<SettingsUpdatedPayload>(
      host,
      "settings_updated",
    );
    host.emit("update_settings", { audienceVoting: false });
    await settled;

    const err = waitForEvent<ServerErrorPayload>(bob.player, "server_error");
    bob.player.emit("cast_vote", { vote: "agree" });

    expect((await err).code).toBe("INVALID_STATE");
  });

  it("resets the tally onto the next player when one is ruled wrong", async () => {
    const { host, bob } = await roomWithActivePlayer();

    // Bob buzzes too, so there is someone to advance to.
    const ordered = waitForEvent<BuzzOrderUpdatedPayload>(
      host,
      "buzz_order_updated",
    );
    const t = Date.now() + 50;
    bob.player.emit("buzz", { mode: "button", localTime: t, adjustedTime: t });
    await ordered;

    const tallied = waitForTally(host, 1, 0);
    bob.player.emit("cast_vote", { vote: "agree" });
    await tallied;

    const reset = waitForMatching<VoteTallyPayload>(
      host,
      "vote_tally",
      (p) => p.tally.activePlayerId === bob.playerId,
    );
    host.emit("advance_queue", { result: "wrong", points: 1 });

    expect((await reset).tally).toMatchObject({ agree: 0, disagree: 0 });
  });

  it("clears the tally once the round resolves", async () => {
    const { host, bob } = await roomWithActivePlayer();

    const tallied = waitForTally(host, 1, 0);
    bob.player.emit("cast_vote", { vote: "agree" });
    await tallied;

    const resolved = waitForMatching<VoteTallyPayload>(
      host,
      "vote_tally",
      (p) => p.tally.activePlayerId === null,
    );
    host.emit("advance_queue", { result: "correct", points: 1 });

    expect((await resolved).tally).toMatchObject({ agree: 0, disagree: 0 });
  });

  it("does not carry votes across to a new round", async () => {
    const { host, alice, bob } = await roomWithActivePlayer();

    const tallied = waitForTally(host, 0, 1);
    bob.player.emit("cast_vote", { vote: "disagree" });
    await tallied;

    const opened = waitForEvent<RoundOpenedPayload>(host, "round_opened");
    host.emit("open_buzz", { buzzMode: "button" });
    await opened;

    const ordered = waitForEvent<BuzzOrderUpdatedPayload>(
      host,
      "buzz_order_updated",
    );
    const t = Date.now();
    alice.player.emit("buzz", {
      mode: "button",
      localTime: t,
      adjustedTime: t,
    });
    await ordered;

    const fresh = waitForTally(host, 1, 0);
    bob.player.emit("cast_vote", { vote: "agree" });
    await fresh;
  });
});

describe("vote panel availability", () => {
  it("announces the tally as soon as a buzz puts someone at the front", async () => {
    // Clients gate the vote panel on a tally naming someone, so this is what
    // makes voting reachable at all -- without it the panel would wait for a
    // tally that only a vote could produce.
    const host = await makeClient();
    const created = waitForEvent<RoomCreatedPayload>(host, "room_created");
    host.emit("create_room", { hostName: "Host" });
    const { room } = await created;

    const settled = waitForEvent<SettingsUpdatedPayload>(
      host,
      "settings_updated",
    );
    host.emit("update_settings", { audienceVoting: true });
    await settled;

    const player = await makeClient();
    const ok = waitForEvent<JoinOkPayload>(player, "join_ok");
    player.emit("join_room", { roomCode: room.roomCode, playerName: "Alice" });
    const playerId = (await ok).yourPlayerId;

    const opened = waitForEvent<RoundOpenedPayload>(player, "round_opened");
    host.emit("open_buzz", { buzzMode: "button" });
    await opened;

    const tallied = waitForMatching<VoteTallyPayload>(
      host,
      "vote_tally",
      (p) => p.tally.activePlayerId === playerId,
    );
    const t = Date.now();
    player.emit("buzz", { mode: "button", localTime: t, adjustedTime: t });

    const { tally } = await tallied;
    expect(tally).toMatchObject({ agree: 0, disagree: 0 });
  });

  it("stays quiet while audience voting is off", async () => {
    const host = await makeClient();
    const created = waitForEvent<RoomCreatedPayload>(host, "room_created");
    host.emit("create_room", { hostName: "Host" });
    const { room } = await created;

    const player = await makeClient();
    const ok = waitForEvent<JoinOkPayload>(player, "join_ok");
    player.emit("join_room", { roomCode: room.roomCode, playerName: "Alice" });
    await ok;

    const opened = waitForEvent<RoundOpenedPayload>(player, "round_opened");
    host.emit("open_buzz", { buzzMode: "button" });
    await opened;

    let tallies = 0;
    host.on("vote_tally", () => tallies++);
    const ordered = waitForEvent<BuzzOrderUpdatedPayload>(
      host,
      "buzz_order_updated",
    );
    const t = Date.now();
    player.emit("buzz", { mode: "button", localTime: t, adjustedTime: t });
    await ordered;
    await new Promise((r) => setTimeout(r, 150));

    expect(tallies).toBe(0);
  });
});
