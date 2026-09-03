import type { LeaderboardEntry } from "@buzzroom/shared";
import type { Player } from "./RoomStore.js";

/**
 * Builds a sorted, ranked leaderboard from the current player list.
 *
 * Ranking rules:
 *   - Sorted by score descending, then name ascending as a stable tiebreaker
 *     (so the leaderboard order is deterministic when scores are equal).
 *   - Standard competition ranking (1-1-3, not 1-1-2): tied players share
 *     a rank, and the next rank skips the used positions. This is the format
 *     audiences recognise from sports and game shows.
 *
 * Includes all players — connected or not — so the host can see the full
 * picture. The isConnected flag lets the client style disconnected players
 * differently (greyed out, etc.) without hiding their score history.
 *
 * Pure function: takes players, returns entries. No mutation, no I/O.
 */
export function buildLeaderboard(players: Player[]): LeaderboardEntry[] {
  if (players.length === 0) return [];

  const sorted = [...players].sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name),
  );

  const result: LeaderboardEntry[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const player = sorted[i]!;
    const prev = sorted[i - 1];
    const prevEntry = result[i - 1];
    const next = sorted[i + 1];

    // If tied with the previous player, share their rank.
    // Otherwise rank = position + 1 (1-indexed), which naturally skips
    // the positions consumed by ties above.
    const rank =
      i === 0 ? 1 : player.score === prev!.score ? prevEntry!.rank : i + 1;

    // A player is tied if their score matches either neighbour in the
    // sorted list (they share rank with someone).
    const isTied =
      (prev !== undefined && prev.score === player.score) ||
      (next !== undefined && next.score === player.score);

    result.push({
      rank,
      playerId: player.playerId,
      name: player.name,
      score: player.score,
      isConnected: player.isConnected,
      isTied,
    });
  }

  return result;
}
