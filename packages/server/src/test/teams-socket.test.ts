import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type {
  JoinOkPayload,
  RoomCreatedPayload,
  ScoreUpdatePayload,
  ServerErrorPayload,
  TeamsUpdatedPayload,
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
 * Waits for the first occurrence of `event` whose payload satisfies
 * `matches`.
 *
 * A roster change broadcasts teams_updated *and* score_update, so several
 * are often in flight at once; waiting for "the next one" would latch onto
 * whichever happened to be queued rather than the one under test.
 */
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

async function openRoom() {
  const host = await makeClient();
  const p = waitForEvent<RoomCreatedPayload>(host, "room_created");
  host.emit("create_room", { hostName: "Host" });
  const { room } = await p;
  return { host, roomCode: room.roomCode };
}

async function joinPlayer(roomCode: string, name: string) {
  const player = await makeClient();
  const p = waitForEvent<JoinOkPayload>(player, "join_ok");
  player.emit("join_room", { roomCode, playerName: name });
  const { yourPlayerId } = await p;
  return { player, playerId: yourPlayerId };
}

/** Creates a team and returns its id from the resulting broadcast. */
async function createTeam(host: ClientSocket, name: string): Promise<string> {
  const updated = waitForEvent<TeamsUpdatedPayload>(host, "teams_updated");
  host.emit("create_team", { name });
  const { teams } = await updated;
  return teams.find((t) => t.name === name)!.teamId;
}

// ── roster ────────────────────────────────────────────────────────────────

describe("team roster", () => {
  it("starts with no teams and team mode off", async () => {
    const host = await makeClient();
    const p = waitForEvent<RoomCreatedPayload>(host, "room_created");
    host.emit("create_room", { hostName: "Host" });
    const { room } = await p;

    expect(room.teams).toEqual([]);
    expect(room.settings.teamsEnabled).toBe(false);
  });

  it("creates a team and broadcasts the roster", async () => {
    const { host, roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    const updated = waitForEvent<TeamsUpdatedPayload>(player, "teams_updated");
    host.emit("create_team", { name: "Red" });

    const { teams } = await updated;
    expect(teams).toHaveLength(1);
    expect(teams[0]!.name).toBe("Red");
    expect(teams[0]!.colour).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("gives each team a distinct colour", async () => {
    const { host } = await openRoom();
    await createTeam(host, "Red");
    const updated = waitForEvent<TeamsUpdatedPayload>(host, "teams_updated");
    host.emit("create_team", { name: "Blue" });

    const { teams } = await updated;
    expect(new Set(teams.map((t) => t.colour)).size).toBe(2);
  });

  it("refuses a duplicate team name", async () => {
    const { host } = await openRoom();
    await createTeam(host, "Red");

    const err = waitForEvent<ServerErrorPayload>(host, "server_error");
    host.emit("create_team", { name: "red" });

    expect((await err).code).toBe("NAME_TAKEN");
  });

  it("refuses team changes from a non-host", async () => {
    const { roomCode } = await openRoom();
    const { player } = await joinPlayer(roomCode, "Alice");

    const err = waitForEvent<ServerErrorPayload>(player, "server_error");
    player.emit("create_team", { name: "Sneaky" });

    expect((await err).code).toBe("UNAUTHORIZED");
  });

  it("assigns a player to a team", async () => {
    const { host, roomCode } = await openRoom();
    const { playerId } = await joinPlayer(roomCode, "Alice");
    const teamId = await createTeam(host, "Red");

    const updated = waitForEvent<TeamsUpdatedPayload>(host, "teams_updated");
    host.emit("assign_team", { playerId, teamId });

    const { players } = await updated;
    expect(players.find((p) => p.playerId === playerId)!.teamId).toBe(teamId);
  });

  it("moves a player back to unassigned with a null team", async () => {
    const { host, roomCode } = await openRoom();
    const { playerId } = await joinPlayer(roomCode, "Alice");
    const teamId = await createTeam(host, "Red");

    let updated = waitForEvent<TeamsUpdatedPayload>(host, "teams_updated");
    host.emit("assign_team", { playerId, teamId });
    await updated;

    updated = waitForEvent<TeamsUpdatedPayload>(host, "teams_updated");
    host.emit("assign_team", { playerId, teamId: null });

    const { players } = await updated;
    expect(players.find((p) => p.playerId === playerId)!.teamId).toBeNull();
  });

  it("rejects an assignment to a team that is not in the room", async () => {
    const { host, roomCode } = await openRoom();
    const { playerId } = await joinPlayer(roomCode, "Alice");

    const err = waitForEvent<ServerErrorPayload>(host, "server_error");
    host.emit("assign_team", {
      playerId,
      teamId: "00000000-0000-4000-8000-000000000000",
    });

    expect((await err).code).toBe("ROOM_NOT_FOUND");
  });

  it("releases members when their team is deleted, keeping their scores", async () => {
    const { host, roomCode } = await openRoom();
    const { playerId } = await joinPlayer(roomCode, "Alice");
    const teamId = await createTeam(host, "Red");

    let updated = waitForEvent<TeamsUpdatedPayload>(host, "teams_updated");
    host.emit("assign_team", { playerId, teamId });
    await updated;

    const scored = waitForEvent<ScoreUpdatePayload>(host, "score_update");
    host.emit("award_points", { playerId, delta: 6 });
    await scored;

    updated = waitForEvent<TeamsUpdatedPayload>(host, "teams_updated");
    host.emit("delete_team", { teamId });

    const { teams, players } = await updated;
    expect(teams).toEqual([]);
    const alice = players.find((p) => p.playerId === playerId)!;
    expect(alice.teamId).toBeNull();
    expect(alice.score).toBe(6);
  });
});

// ── scoring ───────────────────────────────────────────────────────────────

describe("team scoring", () => {
  it("leaves the team board empty while team mode is off", async () => {
    const { host, roomCode } = await openRoom();
    const { playerId } = await joinPlayer(roomCode, "Alice");
    const teamId = await createTeam(host, "Red");

    const updated = waitForEvent<TeamsUpdatedPayload>(host, "teams_updated");
    host.emit("assign_team", { playerId, teamId });
    await updated;

    const scored = waitForMatching<ScoreUpdatePayload>(
      host,
      "score_update",
      (p) =>
        p.leaderboard.some((e) => e.playerId === playerId && e.score === 3),
    );
    host.emit("award_points", { playerId, delta: 3 });

    expect((await scored).teamLeaderboard).toEqual([]);
  });

  it("sums members' scores onto their team once enabled", async () => {
    const { host, roomCode } = await openRoom();
    const { playerId: aliceId } = await joinPlayer(roomCode, "Alice");
    const { playerId: bobId } = await joinPlayer(roomCode, "Bob");
    const teamId = await createTeam(host, "Red");

    for (const playerId of [aliceId, bobId]) {
      const updated = waitForEvent<TeamsUpdatedPayload>(host, "teams_updated");
      host.emit("assign_team", { playerId, teamId });
      await updated;
    }

    const scored = waitForMatching<ScoreUpdatePayload>(
      host,
      "score_update",
      (p) => p.teamLeaderboard[0]?.score === 7,
    );
    host.emit("update_settings", { teamsEnabled: true });
    host.emit("award_points", { playerId: aliceId, delta: 2 });
    host.emit("award_points", { playerId: bobId, delta: 5 });

    const { teamLeaderboard } = await scored;
    expect(teamLeaderboard).toHaveLength(1);
    expect(teamLeaderboard[0]!.memberCount).toBe(2);
  });

  it("re-derives both totals when a player changes team", async () => {
    // Nobody's score changes here -- only which team it counts toward. The
    // derived total is what makes that work without any transfer logic.
    const { host, roomCode } = await openRoom();
    const { playerId } = await joinPlayer(roomCode, "Alice");
    const red = await createTeam(host, "Red");
    const blue = await createTeam(host, "Blue");

    const updated = waitForEvent<TeamsUpdatedPayload>(host, "teams_updated");
    host.emit("assign_team", { playerId, teamId: red });
    await updated;

    let scored = waitForMatching<ScoreUpdatePayload>(
      host,
      "score_update",
      (p) => p.teamLeaderboard.some((t) => t.teamId === red && t.score === 4),
    );
    host.emit("update_settings", { teamsEnabled: true });
    host.emit("award_points", { playerId, delta: 4 });
    await scored;

    scored = waitForMatching<ScoreUpdatePayload>(host, "score_update", (p) =>
      p.teamLeaderboard.some((t) => t.teamId === blue && t.score === 4),
    );
    host.emit("assign_team", { playerId, teamId: blue });

    const { teamLeaderboard } = await scored;
    const byId = Object.fromEntries(
      teamLeaderboard.map((t) => [t.teamId, t.score]),
    );
    expect(byId[red]).toBe(0);
    expect(byId[blue]).toBe(4);
  });

  it("keeps the individual board alongside the team board", async () => {
    const { host, roomCode } = await openRoom();
    const { playerId } = await joinPlayer(roomCode, "Alice");
    const teamId = await createTeam(host, "Red");

    const updated = waitForEvent<TeamsUpdatedPayload>(host, "teams_updated");
    host.emit("assign_team", { playerId, teamId });
    await updated;

    const scored = waitForMatching<ScoreUpdatePayload>(
      host,
      "score_update",
      (p) => p.teamLeaderboard[0]?.score === 3,
    );
    host.emit("update_settings", { teamsEnabled: true });
    host.emit("award_points", { playerId, delta: 3 });

    const { leaderboard } = await scored;
    expect(leaderboard.find((e) => e.playerId === playerId)!.score).toBe(3);
  });
});
