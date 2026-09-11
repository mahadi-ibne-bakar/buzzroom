import { randomBytes, randomInt, randomUUID } from "node:crypto";
import type {
  AudienceVote,
  BuzzMode,
  BuzzEntryView,
  BuzzWindowMode,
  ModeParams,
  RoundView,
  VoteTally,
} from "@buzzroom/shared";
import {
  NEAR_TIE_THRESHOLD_MS,
  MAX_CLOCK_SKEW_MS,
  PATTERN_MIN_LENGTH,
  PATTERN_MAX_LENGTH,
  PATTERN_DOT_COUNT,
} from "../constants.js";

// ── Internal server-side types ────────────────────────────────────────────

export interface BuzzEntry {
  rank: number;
  playerId: string;
  playerName: string;
  serverArrivalTime: number; // when the packet reached the server (audit log)
  adjustedTime: number; // client's latency-corrected estimate of true press time
  eliminated: boolean;
  nearTie: boolean; // within NEAR_TIE_THRESHOLD_MS of an adjacent entry
  mode: BuzzMode; // the input mode this buzz was made with
}

export interface EarlyBuzzLockout {
  lockedUntil: number; // epoch ms
  offenseCount: number;
}

export interface Round {
  roundId: string;
  // The generated parameters for this round's input mode. Regenerated on
  // every open (see createRound) so a gesture can never be pre-practised.
  modeParams: ModeParams;
  status: "open" | "closed";
  // Set once the host has marked someone correct. Distinct from status:
  // "closed" only means no new buzzes are accepted, which is also true after
  // close_buzz while the host is still working through the queue.
  resolved: boolean;
  openedAtServerTime: number;
  buzzOrder: BuzzEntry[];
  lockouts: Map<string, EarlyBuzzLockout>;
  // Audience votes on whoever is currently called on, keyed by voter so a
  // player can change their mind but never vote twice.
  votes: Map<string, AudienceVote>;
  // Who those votes are about. A vote is about one person's answer, so if the
  // active player changes the tally has to start over -- and under free buzz
  // a late buzz with an earlier adjustedTime can take rank 1 and change who
  // is active without the host doing anything.
  votesFor: string | null;
}

// ── Factory ───────────────────────────────────────────────────────────────

/**
 * Builds the parameters a player needs in order to perform this round's
 * gesture, fresh every time.
 *
 * The token is the anti-pre-practice device required by the spec (§6): the
 * slide and pattern parameters must be "generated and broadcast to every
 * player at the exact instant the host opens that round -- never reusable
 * from a previous round". Because a buzz must echo back the token issued
 * for the round it claims to belong to, a client cannot queue up a buzz
 * before the round opens, and cannot replay a buzz captured from an
 * earlier round.
 */
function generateModeParams(mode: BuzzMode): ModeParams {
  switch (mode) {
    case "button":
      // A flat button has no gesture to practise, so there is nothing to
      // parameterise and no token to check.
      return { mode: "button" };

    case "slide":
      return { mode: "slide", token: randomBytes(16).toString("hex") };

    case "pattern":
      return {
        mode: "pattern",
        token: randomBytes(16).toString("hex"),
        sequence: generatePatternSequence(),
      };
  }
}

/**
 * A random walk over distinct dots of the 3x3 grid, PATTERN_MIN_LENGTH to
 * PATTERN_MAX_LENGTH long. Dots never repeat -- a phone-style lock pattern
 * cannot revisit a dot, and repeats would also make the client's
 * "next expected dot" hint ambiguous.
 */
function generatePatternSequence(): number[] {
  const dots = Array.from({ length: PATTERN_DOT_COUNT }, (_, i) => i);

  // Fisher-Yates, using randomInt for a uniform shuffle.
  for (let i = dots.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [dots[i], dots[j]] = [dots[j]!, dots[i]!];
  }

  const length = randomInt(PATTERN_MIN_LENGTH, PATTERN_MAX_LENGTH + 1);
  return dots.slice(0, length);
}

export function createRound(mode: BuzzMode): Round {
  return {
    roundId: randomUUID(),
    modeParams: generateModeParams(mode),
    status: "open",
    resolved: false,
    openedAtServerTime: Date.now(),
    buzzOrder: [],
    lockouts: new Map(),
    votes: new Map(),
    votesFor: null,
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

// ── Gesture credentials ───────────────────────────────────────────────────

export type CredentialCheck =
  | { ok: true }
  | { ok: false; reason: "wrong_mode" | "bad_token" | "bad_sequence" };

/**
 * Verifies that a buzz actually presents this round's gesture credentials.
 *
 * The buzz payload is a discriminated union: slide carries a token, pattern
 * carries a token and the sequence the player traced. Both were issued when
 * the host opened this specific round. Checking them here is what stops a
 * client from skipping the gesture entirely and emitting a raw "buzz" event,
 * or replaying credentials captured from an earlier round.
 *
 * This is a fairness check, not a security boundary -- a determined player
 * can still read the token out of their own round_opened payload and script
 * the buzz. What it guarantees is that everyone is answering the same freshly
 * generated challenge, which is exactly what the spec (§6) asks for.
 */
export function checkBuzzCredentials(
  round: Round,
  payload: {
    mode: BuzzMode;
    token?: string;
    sequence?: number[];
  },
): CredentialCheck {
  const params = round.modeParams;

  if (payload.mode !== params.mode) return { ok: false, reason: "wrong_mode" };

  // A button round issues no token, so there is nothing further to check.
  if (params.mode === "button") return { ok: true };

  if (payload.token !== params.token) return { ok: false, reason: "bad_token" };

  if (params.mode === "pattern") {
    const traced = payload.sequence;
    if (
      traced === undefined ||
      traced.length !== params.sequence.length ||
      traced.some((dot, i) => dot !== params.sequence[i])
    ) {
      return { ok: false, reason: "bad_sequence" };
    }
  }

  return { ok: true };
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
  mode: BuzzMode,
  windowMode: BuzzWindowMode,
): BuzzResult {
  // ── Already answered ──
  // A resolved round is over whatever the window mode says: the host has
  // marked someone correct and moved on, so there is nothing to buzz into.
  if (round.resolved) return { type: "round_closed" };

  // ── Round is closed ──
  // Only "locked" actually shuts the window. Under "free" a closed round
  // still accepts buzzes and no penalty applies -- that is the whole point
  // of the mode (spec §5) -- so fall through to the normal path.
  if (round.status === "closed" && windowMode === "locked") {
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

  // ── Buzz is accepted into the order ──

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
    mode,
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
  | { type: "already_resolved" }
  | { type: "no_active_player" };

export function advanceQueue(
  round: Round,
  result: "correct" | "wrong",
): AdvanceResult {
  // Without this, a host who taps the tick twice -- or whose first tap looked
  // unresponsive on a slow connection -- awards the points twice, silently
  // doubling someone's score.
  if (round.resolved) return { type: "already_resolved" };

  const activeEntry = getActiveEntry(round);
  if (!activeEntry) return { type: "no_active_player" };

  if (result === "correct") {
    round.status = "closed";
    round.resolved = true;
    return { type: "correct", winnerEntry: activeEntry };
  }

  activeEntry.eliminated = true;
  // The queue has moved on to a different answer, so the old votes no longer
  // mean anything.
  clearVotes(round);
  const nextActiveEntry = getActiveEntry(round);
  return { type: "wrong", eliminatedEntry: activeEntry, nextActiveEntry };
}

// ── Audience voting ───────────────────────────────────────────────────────

export type VoteResult =
  | { type: "counted" }
  | { type: "no_active_player" }
  | { type: "cannot_vote_on_self" };

function clearVotes(round: Round): void {
  round.votes.clear();
  round.votesFor = null;
}

/** The player the audience can currently vote on, if any. */
function votablePlayerId(round: Round): string | null {
  if (round.resolved) return null;
  return getActiveEntry(round)?.playerId ?? null;
}

/**
 * Records an audience vote on whoever is currently called on.
 *
 * Keyed by voter, so casting again replaces the previous vote rather than
 * stacking: changing your mind is fine, voting twice is not.
 */
export function castVote(
  round: Round,
  voterId: string,
  vote: AudienceVote,
): VoteResult {
  const activeId = votablePlayerId(round);
  if (activeId === null) return { type: "no_active_player" };
  if (activeId === voterId) return { type: "cannot_vote_on_self" };

  // Whoever we were tallying for is no longer the one answering, so the
  // existing votes are about someone else. Start fresh.
  if (round.votesFor !== activeId) {
    clearVotes(round);
    round.votesFor = activeId;
  }

  round.votes.set(voterId, vote);
  return { type: "counted" };
}

export function toVoteTally(round: Round): VoteTally {
  const activeId = votablePlayerId(round);

  // Votes cast against a different player must not be reported against this
  // one, even if nothing has cleared them yet.
  if (activeId === null || round.votesFor !== activeId) {
    return { activePlayerId: activeId, agree: 0, disagree: 0 };
  }

  let agree = 0;
  let disagree = 0;
  for (const vote of round.votes.values()) {
    if (vote === "agree") agree++;
    else disagree++;
  }

  return { activePlayerId: activeId, agree, disagree };
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
    mode: entry.mode,
  };
}

export function toRoundView(round: Round): RoundView {
  const activeEntry = getActiveEntry(round);
  return {
    roundId: round.roundId,
    status: round.status,
    modeParams: round.modeParams,
    activePlayerId: activeEntry?.playerId ?? null,
    buzzOrder: round.buzzOrder.map(toBuzzEntryView),
  };
}
