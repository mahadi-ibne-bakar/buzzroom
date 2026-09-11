import { describe, expect, it } from "vitest";
import {
  buildLeaderboard,
  buildTeamLeaderboard,
} from "../rooms/leaderboard.js";
import type { Player, Team } from "../rooms/RoomStore.js";

// Helper: minimal Player stub — only the fields buildLeaderboard uses.
function makePlayer(
  overrides: Partial<Player> & {
    playerId: string;
    name: string;
    score: number;
  },
): Player {
  return {
    socketId: "s-" + overrides.playerId,
    isConnected: true,
    teamId: null,
    joinedAt: Date.now(),
    clockOffset: 0,
    lastRtt: null,
    ...overrides,
  };
}

// ── edge cases ────────────────────────────────────────────────────────────

describe("buildLeaderboard — edge cases", () => {
  it("returns an empty array for no players", () => {
    expect(buildLeaderboard([])).toEqual([]);
  });

  it("returns rank 1 and isTied false for a single player", () => {
    const players = [makePlayer({ playerId: "p1", name: "Alice", score: 5 })];
    const board = buildLeaderboard(players);

    expect(board).toHaveLength(1);
    expect(board[0]!.rank).toBe(1);
    expect(board[0]!.isTied).toBe(false);
  });
});

// ── ranking without ties ──────────────────────────────────────────────────

describe("buildLeaderboard — distinct scores", () => {
  it("sorts players by score descending and assigns sequential ranks", () => {
    const players = [
      makePlayer({ playerId: "p3", name: "Carol", score: 3 }),
      makePlayer({ playerId: "p1", name: "Alice", score: 10 }),
      makePlayer({ playerId: "p2", name: "Bob", score: 7 }),
    ];
    const board = buildLeaderboard(players);

    expect(board.map((e) => e.name)).toEqual(["Alice", "Bob", "Carol"]);
    expect(board.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(board.every((e) => !e.isTied)).toBe(true);
  });
});

// ── ties ──────────────────────────────────────────────────────────────────

describe("buildLeaderboard — ties", () => {
  it("gives tied players the same rank", () => {
    const players = [
      makePlayer({ playerId: "p1", name: "Alice", score: 10 }),
      makePlayer({ playerId: "p2", name: "Bob", score: 10 }),
    ];
    const board = buildLeaderboard(players);

    expect(board[0]!.rank).toBe(1);
    expect(board[1]!.rank).toBe(1);
    expect(board[0]!.isTied).toBe(true);
    expect(board[1]!.isTied).toBe(true);
  });

  it("uses 1-1-3 competition ranking (skips rank 2 after a two-way tie at top)", () => {
    const players = [
      makePlayer({ playerId: "p1", name: "Alice", score: 10 }),
      makePlayer({ playerId: "p2", name: "Bob", score: 10 }),
      makePlayer({ playerId: "p3", name: "Carol", score: 5 }),
    ];
    const board = buildLeaderboard(players);

    expect(board.map((e) => e.rank)).toEqual([1, 1, 3]);
    expect(board[2]!.isTied).toBe(false);
  });

  it("handles a tie in the middle of the board", () => {
    // Ranks should be: 1, 2, 2, 4
    const players = [
      makePlayer({ playerId: "p1", name: "Alice", score: 15 }),
      makePlayer({ playerId: "p2", name: "Bob", score: 10 }),
      makePlayer({ playerId: "p3", name: "Carol", score: 10 }),
      makePlayer({ playerId: "p4", name: "Dave", score: 5 }),
    ];
    const board = buildLeaderboard(players);

    expect(board.map((e) => e.rank)).toEqual([1, 2, 2, 4]);
    expect(board[0]!.isTied).toBe(false);
    expect(board[1]!.isTied).toBe(true);
    expect(board[2]!.isTied).toBe(true);
    expect(board[3]!.isTied).toBe(false);
  });

  it("all players tied gives everyone rank 1", () => {
    const players = [
      makePlayer({ playerId: "p1", name: "Alice", score: 5 }),
      makePlayer({ playerId: "p2", name: "Bob", score: 5 }),
      makePlayer({ playerId: "p3", name: "Carol", score: 5 }),
    ];
    const board = buildLeaderboard(players);

    expect(board.every((e) => e.rank === 1)).toBe(true);
    expect(board.every((e) => e.isTied)).toBe(true);
  });

  it("breaks ties alphabetically by name (stable secondary sort)", () => {
    const players = [
      makePlayer({ playerId: "p1", name: "Zara", score: 10 }),
      makePlayer({ playerId: "p2", name: "Alice", score: 10 }),
    ];
    const board = buildLeaderboard(players);

    // Both rank 1, but Alice should appear first (alphabetical)
    expect(board[0]!.name).toBe("Alice");
    expect(board[1]!.name).toBe("Zara");
  });
});

// ── zero and negative scores ──────────────────────────────────────────────

describe("buildLeaderboard — zero and negative scores", () => {
  it("handles zero scores", () => {
    const players = [
      makePlayer({ playerId: "p1", name: "Alice", score: 0 }),
      makePlayer({ playerId: "p2", name: "Bob", score: 0 }),
    ];
    const board = buildLeaderboard(players);

    expect(board.every((e) => e.rank === 1)).toBe(true);
    expect(board.every((e) => e.isTied)).toBe(true);
  });

  it("places players with negative scores below zero-score players", () => {
    const players = [
      makePlayer({ playerId: "p1", name: "Alice", score: 3 }),
      makePlayer({ playerId: "p2", name: "Bob", score: 0 }),
      makePlayer({ playerId: "p3", name: "Carol", score: -2 }),
    ];
    const board = buildLeaderboard(players);

    expect(board[0]!.name).toBe("Alice");
    expect(board[1]!.name).toBe("Bob");
    expect(board[2]!.name).toBe("Carol");
    expect(board[2]!.rank).toBe(3);
  });
});

// ── isConnected passthrough ───────────────────────────────────────────────

describe("buildLeaderboard — connection status", () => {
  it("includes disconnected players and passes isConnected through", () => {
    const players = [
      makePlayer({
        playerId: "p1",
        name: "Alice",
        score: 10,
        isConnected: false,
      }),
      makePlayer({ playerId: "p2", name: "Bob", score: 5, isConnected: true }),
    ];
    const board = buildLeaderboard(players);

    expect(board[0]!.name).toBe("Alice");
    expect(board[0]!.isConnected).toBe(false);
    expect(board[1]!.isConnected).toBe(true);
  });
});

// ── team board ────────────────────────────────────────────────────────────

function makeTeam(teamId: string, name: string): Team {
  return { teamId, name, colour: "#6366f1" };
}

describe("buildTeamLeaderboard", () => {
  const red = makeTeam("t-red", "Red");
  const blue = makeTeam("t-blue", "Blue");

  it("returns an empty array when there are no teams", () => {
    expect(buildTeamLeaderboard([], [])).toEqual([]);
  });

  it("sums each team's member scores", () => {
    const board = buildTeamLeaderboard(
      [
        makePlayer({ playerId: "a", name: "Ann", score: 3, teamId: "t-red" }),
        makePlayer({ playerId: "b", name: "Ben", score: 4, teamId: "t-red" }),
        makePlayer({ playerId: "c", name: "Cat", score: 5, teamId: "t-blue" }),
      ],
      [red, blue],
    );

    expect(board.map((e) => [e.name, e.score, e.memberCount])).toEqual([
      ["Red", 7, 2],
      ["Blue", 5, 1],
    ]);
  });

  it("ignores unassigned players", () => {
    const board = buildTeamLeaderboard(
      [
        makePlayer({ playerId: "a", name: "Ann", score: 3, teamId: "t-red" }),
        makePlayer({ playerId: "b", name: "Ben", score: 99, teamId: null }),
      ],
      [red],
    );

    expect(board[0]!.score).toBe(3);
    expect(board[0]!.memberCount).toBe(1);
  });

  it("ignores a player pointing at a team that no longer exists", () => {
    const board = buildTeamLeaderboard(
      [
        makePlayer({ playerId: "a", name: "Ann", score: 3, teamId: "t-red" }),
        makePlayer({ playerId: "b", name: "Ben", score: 9, teamId: "t-gone" }),
      ],
      [red],
    );

    expect(board).toHaveLength(1);
    expect(board[0]!.score).toBe(3);
  });

  it("shows an empty team with a zero score rather than hiding it", () => {
    const board = buildTeamLeaderboard([], [red, blue]);
    expect(board.map((e) => [e.name, e.score, e.memberCount])).toEqual([
      ["Blue", 0, 0],
      ["Red", 0, 0],
    ]);
  });

  it("uses competition ranking for tied teams, same as the player board", () => {
    const green = makeTeam("t-green", "Green");
    const board = buildTeamLeaderboard(
      [
        makePlayer({ playerId: "a", name: "Ann", score: 5, teamId: "t-red" }),
        makePlayer({ playerId: "b", name: "Ben", score: 5, teamId: "t-blue" }),
        makePlayer({ playerId: "c", name: "Cat", score: 1, teamId: "t-green" }),
      ],
      [red, blue, green],
    );

    // 1-1-3, not 1-1-2.
    expect(board.map((e) => [e.name, e.rank, e.isTied])).toEqual([
      ["Blue", 1, true],
      ["Red", 1, true],
      ["Green", 3, false],
    ]);
  });

  it("carries each team's colour through", () => {
    const board = buildTeamLeaderboard([], [red]);
    expect(board[0]!.colour).toBe("#6366f1");
  });
});
