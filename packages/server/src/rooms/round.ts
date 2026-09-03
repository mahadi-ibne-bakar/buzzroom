import { randomUUID } from "node:crypto";
import type { BuzzEntryView, RoundView } from "@buzzroom/shared";
import { NEAR_TIE_THRESHOLD_MS, MAX_CLOCK_SKEW_MS } from "../constants.js";

// ── Internal server-side types ────────────────────────────────────────────

export interface BuzzEntry {
  rank: number;
  playerId: string;
  playerName: string;
  serverArrivalTime: number; // when the packet reached the server (audit log)
  adjustedTime: number; // client's latency-corrected estimate of true press time
  eliminated: boolean;
  nearTie: boolean; // within NEAR_TIE_THRESHOLD_MS of an adjacent entry
}

export interface EarlyBuzzLockout {
  lockedUntil: number; // epoch ms
  offenseCount: number;
}

export interface Round {
  roundId: string;
  buzzMode: "button";
  status: "open" | "closed";
  openedAtServerTime: number;
  buzzOrder: BuzzEntry[];
  lockouts: Map<string, EarlyBuzzLockout>;
}

// ── Factory ───────────────────────────────────────────────────────────────

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

// ── Queries ───────────────────────────────────────────────────────────────

export function getActiveEntry(round: Round): BuzzEntry | null {
  return round.buzzOrder.find((e) => !e.eliminated) ?? null;
}

// ── Fairness helpers ──────────────────────────────────────────────────────

/**
 * Clamps a client's claimed adjustedTime to a safe range:
 *
 *  floor = round.openedAtServerTime - 100ms
 *      A legitimate buzz can't have happened before the round opened.
 *      The 100ms buffer absorbs clock-estimation error on the client side
 *      so honest players near the boundary don't get their timestamps
 *      artificially raised to the open time.
 *
 *  ceiling = serverNow + MAX_CLOCK_SKEW_MS
 *      Rejects claims that the buzz happened in the future.
 *
 * Why clamp at all if the client computes the offset honestly?
 *   A malicious client could set adjustedTime = openedAtServerTime - 999999
 *   and always "win." Clamping makes that attack useless.
 */
function clampAdjustedTime(
  claimed: number,
  openedAtServerTime: number,
  serverNow: number,
): number {
  const floor = openedAtServerTime - 100;
  const ceiling = serverNow + MAX_CLOCK_SKEW_MS;
  return Math.max(floor, Math.min(ceiling, claimed));
}

/**
 * After adding or modifying any entry, call this to keep the buzz order
 * sorted by adjustedTime and both rank and nearTie values consistent.
 *
 * Why re-sort on every buzz rather than insert in order?
 *  The first packet to arrive at the server might not have the lowest
 *  adjustedTime — that's the whole point of Phase 5. Sorting on every
 *  new entry is O(n log n) in the number of players, which at ≤20 players
 *  is negligible. Correctness over micro-optimisation.
 */
function reRankAndDetectTies(buzzOrder: BuzzEntry[]): void {
  buzzOrder.sort((a, b) => a.adjustedTime - b.adjustedTime);

  for (let i = 0; i < buzzOrder.length; i++) {
    const entry = buzzOrder[i]!;
    entry.rank = i + 1;
    entry.nearTie = false; // reset; re-computed below
  }

  // Mark adjacent entries as near-ties when their adjustedTimes are
  // indistinguishably close. We mark BOTH entries so the host can see
  // the full set of players involved in the tie.
  for (let i = 0; i < buzzOrder.length - 1; i++) {
    const curr = buzzOrder[i]!;
    const next = buzzOrder[i + 1]!;
    if (
      Math.abs(curr.adjustedTime - next.adjustedTime) < NEAR_TIE_THRESHOLD_MS
    ) {
      curr.nearTie = true;
      next.nearTie = true;
    }
  }
}

// ── Buzz processing ───────────────────────────────────────────────────────

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
 * penalty.
 *
 * @param adjustedTime  Client's latency-corrected press time. The server
 *                      clamps this before using it for ranking.
 */
export function processBuzz(
  round: Round,
  playerId: string,
  playerName: string,
  serverTime: number,
  adjustedTime: number,
  earlyPenaltyEnabled: boolean,
): BuzzResult {
  // ── Round is closed ──
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

  // ── Round is open ──

  if (round.buzzOrder.some((e) => e.playerId === playerId)) {
    return { type: "already_buzzed" };
  }

  const lockout = round.lockouts.get(playerId);
  if (lockout !== undefined && lockout.lockedUntil > serverTime) {
    return {
      type: "locked_out",
      remainingMs: lockout.lockedUntil - serverTime,
    };
  }

  // Clamp the claimed adjustedTime before recording it.
  const safeAdjustedTime = clampAdjustedTime(
    adjustedTime,
    round.openedAtServerTime,
    serverTime,
  );

  const entry: BuzzEntry = {
    rank: 0, // assigned by reRankAndDetectTies below
    playerId,
    playerName,
    serverArrivalTime: serverTime,
    adjustedTime: safeAdjustedTime,
    eliminated: false,
    nearTie: false,
  };

  round.buzzOrder.push(entry);
  reRankAndDetectTies(round.buzzOrder);

  return { type: "accepted", entry };
}

// ── Queue advancement ─────────────────────────────────────────────────────

export type AdvanceResult =
  | {
      type: "wrong";
      eliminatedEntry: BuzzEntry;
      nextActiveEntry: BuzzEntry | null;
    }
  | { type: "correct"; winnerEntry: BuzzEntry }
  | { type: "no_active_player" };

export function advanceQueue(
  round: Round,
  result: "correct" | "wrong",
): AdvanceResult {
  const activeEntry = getActiveEntry(round);
  if (!activeEntry) return { type: "no_active_player" };

  if (result === "correct") {
    round.status = "closed";
    return { type: "correct", winnerEntry: activeEntry };
  }

  activeEntry.eliminated = true;
  const nextActiveEntry = getActiveEntry(round);
  return { type: "wrong", eliminatedEntry: activeEntry, nextActiveEntry };
}

// ── View conversion ───────────────────────────────────────────────────────

export function toBuzzEntryView(entry: BuzzEntry): BuzzEntryView {
  return {
    rank: entry.rank,
    playerId: entry.playerId,
    playerName: entry.playerName,
    eliminated: entry.eliminated,
    adjustedTime: entry.adjustedTime,
    nearTie: entry.nearTie,
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
