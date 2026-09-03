import { randomUUID } from "node:crypto";
import type { BuzzEntryView, RoundView } from "@buzzroom/shared";

// ---------- Internal server-side types ----------
// NOT the client-facing View types. The view types are created by
// toRoundView() at the point of sending, so internal fields like
// lockouts and serverArrivalTime never reach the client.

export interface BuzzEntry {
  rank: number; // 1-based; set at the moment the buzz arrives
  playerId: string;
  playerName: string;
  serverArrivalTime: number; // used for naive ordering in Phase 4
  // replaced by adjustedTime in Phase 5 (fairness engine)
  eliminated: boolean; // true after host marks this player wrong
}

export interface EarlyBuzzLockout {
  lockedUntil: number; // epoch ms; buzz attempts before this time are rejected
  offenseCount: number; // how many times this player offended in this round
}

export interface Round {
  roundId: string;
  buzzMode: "button"; // expands in Phase 8
  status: "open" | "closed";
  openedAtServerTime: number;
  buzzOrder: BuzzEntry[]; // sorted by serverArrivalTime, ascending
  lockouts: Map<string, EarlyBuzzLockout>; // playerId → lockout
}

// ---------- Factory ----------

export function createRound(buzzMode: "button"): Round {
  return {
    roundId: randomUUID(),
    buzzMode,
    status: "open",
    openedAtServerTime: Date.now(),
    buzzOrder: [],
    lockouts: new Map(),
  };
}

// ---------- Queries ----------

/**
 * Returns the first non-eliminated player in the buzz order, or null if
 * everyone has been eliminated or the order is empty. This is the player
 * who should currently be answering.
 */
export function getActiveEntry(round: Round): BuzzEntry | null {
  return round.buzzOrder.find((e) => !e.eliminated) ?? null;
}

// ---------- Buzz processing ----------

// Penalty durations in ms for the 1st, 2nd, 3rd+ offenses within a round.
// Escalating so that repeated jump-buzzing becomes increasingly costly.
const PENALTY_DURATIONS_MS = [500, 1_000, 1_500] as const;

function getPenaltyMs(offenseCount: number): number {
  const idx = Math.min(offenseCount - 1, PENALTY_DURATIONS_MS.length - 1);
  return PENALTY_DURATIONS_MS[idx] ?? 1_500;
}

export type BuzzResult =
  | { type: "accepted"; entry: BuzzEntry }
  | { type: "already_buzzed" }
  | { type: "locked_out"; remainingMs: number }
  | { type: "penalty_applied"; lockedForMs: number; offenseCount: number }
  | { type: "round_closed" };

/**
 * Processes a buzz attempt. Mutates the round in place on acceptance or
 * penalty — callers should not assume the round is unchanged after calling.
 *
 * @param earlyPenaltyEnabled  Whether to apply a penalty for buzzing while
 *                             the round is closed (host setting).
 */
export function processBuzz(
  round: Round,
  playerId: string,
  playerName: string,
  serverTime: number,
  earlyPenaltyEnabled: boolean,
): BuzzResult {
  // ---------- Round is closed ----------
  if (round.status === "closed") {
    if (!earlyPenaltyEnabled) return { type: "round_closed" };

    const existing = round.lockouts.get(playerId);
    const offenseCount = (existing?.offenseCount ?? 0) + 1;
    const lockedForMs = getPenaltyMs(offenseCount);

    round.lockouts.set(playerId, {
      lockedUntil: serverTime + lockedForMs,
      offenseCount,
    });

    return { type: "penalty_applied", lockedForMs, offenseCount };
  }

  // ---------- Round is open ----------

  // Already in the queue — duplicate buzz
  if (round.buzzOrder.some((e) => e.playerId === playerId)) {
    return { type: "already_buzzed" };
  }

  // Still locked out from a previous penalty in this round
  const lockout = round.lockouts.get(playerId);
  if (lockout !== undefined && lockout.lockedUntil > serverTime) {
    return {
      type: "locked_out",
      remainingMs: lockout.lockedUntil - serverTime,
    };
  }

  const entry: BuzzEntry = {
    rank: round.buzzOrder.length + 1,
    playerId,
    playerName,
    serverArrivalTime: serverTime,
    eliminated: false,
  };

  round.buzzOrder.push(entry);
  return { type: "accepted", entry };
}

// ---------- Queue advancement ----------

export type AdvanceResult =
  | {
      type: "wrong";
      eliminatedEntry: BuzzEntry;
      nextActiveEntry: BuzzEntry | null;
    }
  | { type: "correct"; winnerEntry: BuzzEntry }
  | { type: "no_active_player" };

/**
 * Handles the host marking a player correct or wrong.
 * - "correct": closes the round and returns the winner.
 * - "wrong": eliminates the active player and returns the next one.
 *
 * Mutates the round in place.
 */
export function advanceQueue(
  round: Round,
  result: "correct" | "wrong",
): AdvanceResult {
  const activeEntry = getActiveEntry(round);
  if (!activeEntry) return { type: "no_active_player" };

  if (result === "correct") {
    // Closing the round here prevents any more buzzes from sneaking in.
    round.status = "closed";
    return { type: "correct", winnerEntry: activeEntry };
  }

  // Wrong: eliminate this player, find the next one in line
  activeEntry.eliminated = true;
  const nextActiveEntry = getActiveEntry(round);
  return { type: "wrong", eliminatedEntry: activeEntry, nextActiveEntry };
}

// ---------- View conversion ----------

export function toBuzzEntryView(entry: BuzzEntry): BuzzEntryView {
  return {
    rank: entry.rank,
    playerId: entry.playerId,
    playerName: entry.playerName,
    eliminated: entry.eliminated,
  };
}

export function toRoundView(round: Round): RoundView {
  const activeEntry = getActiveEntry(round);
  return {
    roundId: round.roundId,
    status: round.status,
    buzzMode: round.buzzMode,
    activePlayerId: activeEntry?.playerId ?? null,
    buzzOrder: round.buzzOrder.map(toBuzzEntryView),
  };
}
