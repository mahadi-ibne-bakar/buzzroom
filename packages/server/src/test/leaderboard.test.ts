import { describe, expect, it } from "vitest";
import { buildLeaderboard } from "../rooms/leaderboard.js";
import type { Player } from "../rooms/RoomStore.js";

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
