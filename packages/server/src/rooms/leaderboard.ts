import type { LeaderboardEntry, TeamLeaderboardEntry } from "@buzzroom/shared";
import type { Player, Team } from "./RoomStore.js";

/**
 * Assigns standard competition ranks (1-1-3, not 1-1-2) to an already-sorted
 * list: tied entries share a rank and the next rank skips the positions the
 * tie consumed. This is the format audiences recognise from sports and game
 * shows.
 *
 * Shared by the player and team boards so both rank identically — a tie has
 * to look the same whichever board is on screen.
 */
function rankSorted<T>(
  sorted: T[],
  scoreOf: (item: T) => number,
): { item: T; rank: number; isTied: boolean }[] {
  const ranked: { item: T; rank: number; isTied: boolean }[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i]!;
    const score = scoreOf(item);
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    const tiedAbove = prev !== undefined && scoreOf(prev) === score;
    const tiedBelow = next !== undefined && scoreOf(next) === score;

    ranked.push({
      item,
      // Tied with the entry above? Share its rank. Otherwise the rank is the
      // 1-indexed position, which naturally skips positions used by ties.
      rank: tiedAbove ? ranked[i - 1]!.rank : i + 1,
      isTied: tiedAbove || tiedBelow,
    });
  }

  return ranked;
}

/**
 * Builds a sorted, ranked leaderboard from the current player list.
 *
 * Sorted by score descending, then name ascending as a stable tiebreaker so
 * the order is deterministic when scores are equal.
 *
 * Includes all players — connected or not — so the host can see the full
 * picture. The isConnected flag lets the client style disconnected players
 * differently (greyed out, etc.) without hiding their score history.
 *
 * Pure function: takes players, returns entries. No mutation, no I/O.
 */
export function buildLeaderboard(players: Player[]): LeaderboardEntry[] {
  const sorted = [...players].sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name),
  );

  return rankSorted(sorted, (p) => p.score).map(({ item, rank, isTied }) => ({
    rank,
    playerId: item.playerId,
    name: item.name,
    score: item.score,
    isConnected: item.isConnected,
    isTied,
  }));
}

/**
 * Builds the team board.
 *
 * A team's score is the sum of its members' scores rather than a figure
 * tracked alongside them. That keeps one source of truth for a point: the
 * player who earned it. Turning team mode on or off, moving someone between
 * teams, or deleting a team can therefore never lose or double-count
 * anything — the totals simply re-derive.
 *
 * Unassigned players are not represented. They still hold their own scores
 * and still appear on the individual board.
 */
export function buildTeamLeaderboard(
  players: Player[],
  teams: Team[],
): TeamLeaderboardEntry[] {
  const totals = new Map<string, { score: number; memberCount: number }>(
    teams.map((t) => [t.teamId, { score: 0, memberCount: 0 }]),
  );

  for (const player of players) {
    if (player.teamId === null) continue;
    const total = totals.get(player.teamId);
    if (!total) continue; // member of a team that has since been deleted
    total.score += player.score;
    total.memberCount += 1;
  }

  const sorted = [...teams].sort((a, b) => {
    const aScore = totals.get(a.teamId)!.score;
    const bScore = totals.get(b.teamId)!.score;
    return bScore - aScore || a.name.localeCompare(b.name);
  });

  return rankSorted(sorted, (t) => totals.get(t.teamId)!.score).map(
    ({ item, rank, isTied }) => ({
      rank,
      teamId: item.teamId,
      name: item.name,
      colour: item.colour,
      score: totals.get(item.teamId)!.score,
      memberCount: totals.get(item.teamId)!.memberCount,
      isTied,
    }),
  );
}
