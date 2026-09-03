import { describe, expect, it } from "vitest";
import {
  createRound,
  processBuzz,
  advanceQueue,
  getActiveEntry,
} from "../rooms/round.js";

// ── createRound ───────────────────────────────────────────────────────────

describe("createRound", () => {
  it("starts with status open and an empty buzz order", () => {
    const round = createRound("button");
    expect(round.status).toBe("open");
    expect(round.modeParams.mode).toBe("button");
    expect(round.buzzOrder).toHaveLength(0);
  });
});

// ── processBuzz — open round ──────────────────────────────────────────────

describe("processBuzz — open round", () => {
  it("accepts a buzz and assigns rank 1 to the first player", () => {
    const round = createRound("button");
    const t = Date.now();
    const result = processBuzz(round, "p1", "Alice", t, t, true, "button");

    expect(result.type).toBe("accepted");
    if (result.type !== "accepted") return;
    expect(result.entry.rank).toBe(1);
    expect(result.entry.playerName).toBe("Alice");
    expect(round.buzzOrder).toHaveLength(1);
  });

  it("assigns ascending ranks to successive buzzes", () => {
    const round = createRound("button");
    const t = Date.now();
    processBuzz(round, "p1", "Alice", t, t, true, "button");
    const r2 = processBuzz(round, "p2", "Bob", t + 10, t + 10, true, "button");

    expect(r2.type).toBe("accepted");
    if (r2.type !== "accepted") return;
    expect(r2.entry.rank).toBe(2);
  });

  it("returns already_buzzed if the same player buzzes twice", () => {
    const round = createRound("button");
    const t = Date.now();
    processBuzz(round, "p1", "Alice", t, t, true, "button");
    const result = processBuzz(
      round,
      "p1",
      "Alice",
      t + 1,
      t + 1,
      true,
      "button",
    );

    expect(result.type).toBe("already_buzzed");
    expect(round.buzzOrder).toHaveLength(1);
  });
});

// ── processBuzz — fairness / adjustedTime ─────────────────────────────────

describe("processBuzz — adjustedTime ordering", () => {
  it("gives rank 1 to the lower adjustedTime even when it arrives second", () => {
    // Bob arrives at the server FIRST (lower serverTime) but his
    // adjustedTime is higher — meaning he pressed later.
    // Alice's packet was delayed, but she pressed first.
    const round = createRound("button");
    const open = round.openedAtServerTime;

    // Bob: arrives first (serverTime = open+10), pressed at open+200
    processBuzz(round, "p2", "Bob", open + 10, open + 200, true, "button");
    // Alice: arrives second (serverTime = open+50), pressed at open+100
    processBuzz(round, "p1", "Alice", open + 50, open + 100, true, "button");

    expect(round.buzzOrder[0]!.playerName).toBe("Alice"); // lower adjustedTime
    expect(round.buzzOrder[0]!.rank).toBe(1);
    expect(round.buzzOrder[1]!.playerName).toBe("Bob");
    expect(round.buzzOrder[1]!.rank).toBe(2);
  });

  it("clamps adjustedTime that is too far in the past to the floor", () => {
    const round = createRound("button");
    const serverNow = round.openedAtServerTime + 500;

    // Attempt to cheat by backdating 10 seconds before round opened
    const cheatTime = round.openedAtServerTime - 10_000;
    processBuzz(round, "p1", "Cheat", serverNow, cheatTime, true, "button");

    // Should be clamped to (openedAtServerTime - 100ms buffer)
    const floor = round.openedAtServerTime - 100;
    expect(round.buzzOrder[0]!.adjustedTime).toBe(floor);
  });

  it("clamps adjustedTime that is in the future", () => {
    const round = createRound("button");
    const serverNow = round.openedAtServerTime + 100;
    // MAX_CLOCK_SKEW_MS = 2000; claim 5 seconds in the future
    const futureTime = serverNow + 5_000;
    processBuzz(round, "p1", "Alice", serverNow, futureTime, true, "button");

    // Clamped to serverNow + 2000
    expect(round.buzzOrder[0]!.adjustedTime).toBeLessThanOrEqual(
      serverNow + 2_000,
    );
  });
});

// ── Near-tie detection ────────────────────────────────────────────────────

describe("processBuzz — near-tie detection", () => {
  it("marks both entries as nearTie when within 50ms", () => {
    const round = createRound("button");
    const open = round.openedAtServerTime;

    processBuzz(round, "p1", "Alice", open + 10, open + 100, true, "button");
    processBuzz(round, "p2", "Bob", open + 20, open + 130, true, "button"); // 30ms apart

    expect(round.buzzOrder[0]!.nearTie).toBe(true);
    expect(round.buzzOrder[1]!.nearTie).toBe(true);
  });

  it("does not mark entries as nearTie when more than 50ms apart", () => {
    const round = createRound("button");
    const open = round.openedAtServerTime;

    processBuzz(round, "p1", "Alice", open + 10, open + 100, true, "button");
    processBuzz(round, "p2", "Bob", open + 20, open + 200, true, "button"); // 100ms apart

    expect(round.buzzOrder[0]!.nearTie).toBe(false);
    expect(round.buzzOrder[1]!.nearTie).toBe(false);
  });

  it("marks only adjacent entries in a 3-player scenario", () => {
    // Alice: 100ms, Bob: 140ms (40ms from Alice — near-tie)
    // Carol: 300ms (160ms from Bob — not near-tie)
    const round = createRound("button");
    const open = round.openedAtServerTime;

    processBuzz(round, "p1", "Alice", open + 5, open + 100, true, "button");
    processBuzz(round, "p2", "Bob", open + 10, open + 140, true, "button");
    processBuzz(round, "p3", "Carol", open + 15, open + 300, true, "button");

    expect(round.buzzOrder[0]!.playerName).toBe("Alice");
    expect(round.buzzOrder[0]!.nearTie).toBe(true); // near-tie with Bob
    expect(round.buzzOrder[1]!.playerName).toBe("Bob");
    expect(round.buzzOrder[1]!.nearTie).toBe(true); // near-tie with Alice
    expect(round.buzzOrder[2]!.playerName).toBe("Carol");
    expect(round.buzzOrder[2]!.nearTie).toBe(false); // not near-tie with Bob
  });
});

// ── processBuzz — closed round ────────────────────────────────────────────

describe("processBuzz — closed round", () => {
  it("applies a penalty when earlyPenaltyEnabled and round is closed", () => {
    const round = createRound("button");
    round.status = "closed";
    const t = Date.now();

    const result = processBuzz(round, "p1", "Alice", t, t, true, "button");

    expect(result.type).toBe("penalty_applied");
    if (result.type !== "penalty_applied") return;
    expect(result.lockedForMs).toBe(500);
    expect(result.offenseCount).toBe(1);
  });

  it("escalates the penalty on successive offenses", () => {
    const round = createRound("button");
    round.status = "closed";
    const t = Date.now();

    processBuzz(round, "p1", "Alice", t, t, true, "button");
    const r2 = processBuzz(round, "p1", "Alice", t + 1, t + 1, true, "button");

    expect(r2.type).toBe("penalty_applied");
    if (r2.type !== "penalty_applied") return;
    expect(r2.lockedForMs).toBe(1_000);
    expect(r2.offenseCount).toBe(2);
  });

  it("caps the penalty at 1500ms from the third offense onward", () => {
    const round = createRound("button");
    round.status = "closed";
    const t = Date.now();

    processBuzz(round, "p1", "Alice", t, t, true, "button");
    processBuzz(round, "p1", "Alice", t + 1, t + 1, true, "button");
    const r3 = processBuzz(round, "p1", "Alice", t + 2, t + 2, true, "button");

    expect(r3.type).toBe("penalty_applied");
    if (r3.type !== "penalty_applied") return;
    expect(r3.lockedForMs).toBe(1_500);
  });

  it("returns round_closed (no penalty) when earlyPenaltyEnabled is false", () => {
    const round = createRound("button");
    round.status = "closed";
    const t = Date.now();

    const result = processBuzz(round, "p1", "Alice", t, t, false, "button");
    expect(result.type).toBe("round_closed");
  });
});

// ── processBuzz — lockout ─────────────────────────────────────────────────

describe("processBuzz — active lockout", () => {
  it("returns locked_out while a penalty lockout is still active", () => {
    const round = createRound("button");
    round.status = "closed";

    const t = 1_000;
    processBuzz(round, "p1", "Alice", t, t, true, "button"); // 500ms lock

    round.status = "open";
    const result = processBuzz(
      round,
      "p1",
      "Alice",
      t + 100,
      t + 100,
      true,
      "button",
    );

    expect(result.type).toBe("locked_out");
    if (result.type !== "locked_out") return;
    expect(result.remainingMs).toBe(400);
  });

  it("accepts the buzz once the lockout has expired", () => {
    const round = createRound("button");
    round.status = "closed";

    const t = 1_000;
    processBuzz(round, "p1", "Alice", t, t, true, "button"); // 500ms lock

    round.status = "open";
    const result = processBuzz(
      round,
      "p1",
      "Alice",
      t + 600,
      t + 600,
      true,
      "button",
    );

    expect(result.type).toBe("accepted");
  });
});

// ── getActiveEntry ────────────────────────────────────────────────────────

describe("getActiveEntry", () => {
  it("returns null for an empty buzz order", () => {
    const round = createRound("button");
    expect(getActiveEntry(round)).toBeNull();
  });

  it("returns the first non-eliminated entry", () => {
    const round = createRound("button");
    const t = Date.now();
    processBuzz(round, "p1", "Alice", t, t, true, "button");
    processBuzz(round, "p2", "Bob", t + 1, t + 100, true, "button");

    round.buzzOrder[0]!.eliminated = true;

    const active = getActiveEntry(round);
    expect(active?.playerId).toBe("p2");
  });

  it("returns null when all entries are eliminated", () => {
    const round = createRound("button");
    const t = Date.now();
    processBuzz(round, "p1", "Alice", t, t, true, "button");
    round.buzzOrder[0]!.eliminated = true;

    expect(getActiveEntry(round)).toBeNull();
  });
});

// ── advanceQueue ──────────────────────────────────────────────────────────

describe("advanceQueue", () => {
  it("returns no_active_player when the buzz order is empty", () => {
    const round = createRound("button");
    expect(advanceQueue(round, "correct").type).toBe("no_active_player");
  });

  it("correct — closes the round and returns the winner", () => {
    const round = createRound("button");
    const t = Date.now();
    processBuzz(round, "p1", "Alice", t, t, true, "button");

    const result = advanceQueue(round, "correct");

    expect(result.type).toBe("correct");
    if (result.type !== "correct") return;
    expect(result.winnerEntry.playerId).toBe("p1");
    expect(round.status).toBe("closed");
  });

  it("wrong — eliminates active player and promotes the next one", () => {
    const round = createRound("button");
    const t = Date.now();
    processBuzz(round, "p1", "Alice", t, t, true, "button");
    processBuzz(round, "p2", "Bob", t + 1, t + 100, true, "button");

    const result = advanceQueue(round, "wrong");

    expect(result.type).toBe("wrong");
    if (result.type !== "wrong") return;
    expect(result.eliminatedEntry.playerId).toBe("p1");
    expect(result.eliminatedEntry.eliminated).toBe(true);
    expect(result.nextActiveEntry?.playerId).toBe("p2");
  });

  it("wrong — returns null for nextActiveEntry when no one is left", () => {
    const round = createRound("button");
    const t = Date.now();
    processBuzz(round, "p1", "Alice", t, t, true, "button");

    const result = advanceQueue(round, "wrong");

    expect(result.type).toBe("wrong");
    if (result.type !== "wrong") return;
    expect(result.nextActiveEntry).toBeNull();
  });
});

// ── double-resolve guard ──────────────────────────────────────────────────

describe("advanceQueue resolution guard", () => {
  it("refuses a second correct on an already-resolved round", () => {
    const round = createRound("button");
    const t = Date.now();
    processBuzz(round, "p1", "Alice", t, t, true, "button");

    expect(advanceQueue(round, "correct").type).toBe("correct");
    // A host double-tapping the tick must not award the points twice.
    expect(advanceQueue(round, "correct").type).toBe("already_resolved");
  });

  it("refuses a wrong after the round has been resolved", () => {
    const round = createRound("button");
    const t = Date.now();
    processBuzz(round, "p1", "Alice", t, t, true, "button");
    processBuzz(round, "p2", "Bob", t + 10, t + 10, true, "button");

    advanceQueue(round, "correct");

    expect(advanceQueue(round, "wrong").type).toBe("already_resolved");
  });

  it("still allows working through the queue before a correct", () => {
    const round = createRound("button");
    const t = Date.now();
    processBuzz(round, "p1", "Alice", t, t, true, "button");
    processBuzz(round, "p2", "Bob", t + 10, t + 10, true, "button");

    expect(advanceQueue(round, "wrong").type).toBe("wrong");
    expect(advanceQueue(round, "correct").type).toBe("correct");
  });
});
