import { describe, expect, it } from "vitest";
import {
  createRound,
  processBuzz,
  advanceQueue,
  getActiveEntry,
} from "../rooms/round.js";

// ---------- createRound ----------

describe("createRound", () => {
  it("starts with status open and an empty buzz order", () => {
    const round = createRound("button");
    expect(round.status).toBe("open");
    expect(round.buzzMode).toBe("button");
    expect(round.buzzOrder).toHaveLength(0);
  });
});

// ---------- processBuzz — happy paths ----------

describe("processBuzz — open round", () => {
  it("accepts a buzz and assigns rank 1 to the first player", () => {
    const round = createRound("button");
    const result = processBuzz(round, "p1", "Alice", Date.now(), true);

    expect(result.type).toBe("accepted");
    if (result.type !== "accepted") return;
    expect(result.entry.rank).toBe(1);
    expect(result.entry.playerName).toBe("Alice");
    expect(round.buzzOrder).toHaveLength(1);
  });

  it("assigns ascending ranks to successive buzzes", () => {
    const round = createRound("button");
    const t = Date.now();

    processBuzz(round, "p1", "Alice", t, true);
    const r2 = processBuzz(round, "p2", "Bob", t + 10, true);

    expect(r2.type).toBe("accepted");
    if (r2.type !== "accepted") return;
    expect(r2.entry.rank).toBe(2);
  });

  it("returns already_buzzed if the same player buzzes twice", () => {
    const round = createRound("button");
    processBuzz(round, "p1", "Alice", Date.now(), true);
    const result = processBuzz(round, "p1", "Alice", Date.now() + 1, true);

    expect(result.type).toBe("already_buzzed");
    expect(round.buzzOrder).toHaveLength(1); // no duplicate entry
  });
});

// ---------- processBuzz — closed round ----------

describe("processBuzz — closed round", () => {
  it("applies a penalty when earlyPenaltyEnabled and round is closed", () => {
    const round = createRound("button");
    round.status = "closed";

    const result = processBuzz(round, "p1", "Alice", Date.now(), true);

    expect(result.type).toBe("penalty_applied");
    if (result.type !== "penalty_applied") return;
    expect(result.lockedForMs).toBe(500); // first offense
    expect(result.offenseCount).toBe(1);
  });

  it("escalates the penalty on successive offenses", () => {
    const round = createRound("button");
    round.status = "closed";

    processBuzz(round, "p1", "Alice", Date.now(), true); // offense 1 → 500ms
    const r2 = processBuzz(round, "p1", "Alice", Date.now() + 1, true); // offense 2

    expect(r2.type).toBe("penalty_applied");
    if (r2.type !== "penalty_applied") return;
    expect(r2.lockedForMs).toBe(1_000); // second offense
    expect(r2.offenseCount).toBe(2);
  });

  it("caps the penalty at 1500ms on the third+ offense", () => {
    const round = createRound("button");
    round.status = "closed";
    const t = Date.now();

    processBuzz(round, "p1", "Alice", t, true);
    processBuzz(round, "p1", "Alice", t + 1, true);
    const r3 = processBuzz(round, "p1", "Alice", t + 2, true);

    expect(r3.type).toBe("penalty_applied");
    if (r3.type !== "penalty_applied") return;
    expect(r3.lockedForMs).toBe(1_500);
  });

  it("returns round_closed (no penalty) when earlyPenaltyEnabled is false", () => {
    const round = createRound("button");
    round.status = "closed";

    const result = processBuzz(round, "p1", "Alice", Date.now(), false);
    expect(result.type).toBe("round_closed");
  });
});

// ---------- processBuzz — lockout ----------

describe("processBuzz — active lockout", () => {
  it("returns locked_out while a penalty lockout is still active", () => {
    const round = createRound("button");
    round.status = "closed";

    const t = 1_000;
    processBuzz(round, "p1", "Alice", t, true); // applies 500ms lock

    // Re-open the round; player is still locked
    round.status = "open";
    const result = processBuzz(round, "p1", "Alice", t + 100, true);

    expect(result.type).toBe("locked_out");
    if (result.type !== "locked_out") return;
    expect(result.remainingMs).toBe(400); // 500 - 100
  });

  it("accepts the buzz once the lockout has expired", () => {
    const round = createRound("button");
    round.status = "closed";

    const t = 1_000;
    processBuzz(round, "p1", "Alice", t, true); // 500ms lock

    round.status = "open";
    const result = processBuzz(round, "p1", "Alice", t + 600, true); // past expiry

    expect(result.type).toBe("accepted");
  });
});

// ---------- getActiveEntry ----------

describe("getActiveEntry", () => {
  it("returns null for an empty buzz order", () => {
    const round = createRound("button");
    expect(getActiveEntry(round)).toBeNull();
  });

  it("returns the first non-eliminated entry", () => {
    const round = createRound("button");
    const t = Date.now();
    processBuzz(round, "p1", "Alice", t, true);
    processBuzz(round, "p2", "Bob", t + 1, true);

    // Eliminate first player
    round.buzzOrder[0]!.eliminated = true;

    const active = getActiveEntry(round);
    expect(active?.playerId).toBe("p2");
  });

  it("returns null when all entries are eliminated", () => {
    const round = createRound("button");
    processBuzz(round, "p1", "Alice", Date.now(), true);
    round.buzzOrder[0]!.eliminated = true;

    expect(getActiveEntry(round)).toBeNull();
  });
});

// ---------- advanceQueue ----------

describe("advanceQueue", () => {
  it("returns no_active_player when the buzz order is empty", () => {
    const round = createRound("button");
    const result = advanceQueue(round, "correct");
    expect(result.type).toBe("no_active_player");
  });

  it("correct — closes the round and returns the winner", () => {
    const round = createRound("button");
    processBuzz(round, "p1", "Alice", Date.now(), true);

    const result = advanceQueue(round, "correct");

    expect(result.type).toBe("correct");
    if (result.type !== "correct") return;
    expect(result.winnerEntry.playerId).toBe("p1");
    expect(round.status).toBe("closed"); // round closed on correct answer
  });

  it("wrong — eliminates active player and promotes the next one", () => {
    const round = createRound("button");
    const t = Date.now();
    processBuzz(round, "p1", "Alice", t, true);
    processBuzz(round, "p2", "Bob", t + 1, true);

    const result = advanceQueue(round, "wrong");

    expect(result.type).toBe("wrong");
    if (result.type !== "wrong") return;
    expect(result.eliminatedEntry.playerId).toBe("p1");
    expect(result.eliminatedEntry.eliminated).toBe(true);
    expect(result.nextActiveEntry?.playerId).toBe("p2");
  });

  it("wrong — returns null for nextActiveEntry when no one is left", () => {
    const round = createRound("button");
    processBuzz(round, "p1", "Alice", Date.now(), true);

    const result = advanceQueue(round, "wrong");

    expect(result.type).toBe("wrong");
    if (result.type !== "wrong") return;
    expect(result.nextActiveEntry).toBeNull();
  });
});
