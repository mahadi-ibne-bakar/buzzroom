import type { TeamLeaderboardEntry } from "@buzzroom/shared";

interface Props {
  entries: TeamLeaderboardEntry[];
  /** Highlights the viewer's own team. Null for the host and presenter. */
  myTeamId?: string | null;
  /** Bigger type for the presenter screen. */
  large?: boolean;
}

export function TeamLeaderboard({ entries, myTeamId, large = false }: Props) {
  if (entries.length === 0) {
    return (
      <p
        className={`text-slate-500 text-center py-4 ${large ? "text-3xl" : "text-sm"}`}
      >
        No teams yet
      </p>
    );
  }

  return (
    <ol className={`flex flex-col ${large ? "gap-2" : "gap-1"}`}>
      {entries.map((entry) => (
        <li
          key={entry.teamId}
          className={`flex items-center rounded-xl bg-slate-800 ${
            large ? "gap-5 px-6 py-3" : "gap-3 px-4 py-2"
          } ${entry.teamId === myTeamId ? "ring-2 ring-white/30" : ""}`}
          // The team's own colour down the leading edge: on a screen across
          // the room this is what tells two rows apart, not the name.
          style={{ borderLeft: `6px solid ${entry.colour}` }}
        >
          <span
            className={`font-bold text-slate-400 ${large ? "text-3xl w-14" : "text-sm w-6"}`}
          >
            {entry.isTied ? `=${entry.rank}` : entry.rank}
          </span>
          <span
            className={`flex-1 font-medium text-white truncate ${
              large ? "text-3xl" : "text-sm"
            }`}
          >
            {entry.name}
            {/* Glyphed so it can't be mistaken for the score sitting beside
                it -- "Blues 2" next to a 7 is ambiguous at a distance. */}
            <span
              className={`text-slate-500 ml-2 ${large ? "text-xl" : "text-xs"}`}
              title={`${entry.memberCount} player${
                entry.memberCount === 1 ? "" : "s"
              }`}
            >
              👤{entry.memberCount}
            </span>
          </span>
          <span
            className={`font-bold text-white tabular-nums ${large ? "text-4xl" : ""}`}
          >
            {entry.score}
          </span>
        </li>
      ))}
    </ol>
  );
}
