import type { LeaderboardEntry } from "@buzzroom/shared";

interface Props {
  entries: LeaderboardEntry[];
  myPlayerId: string | null;
}

export function Leaderboard({ entries, myPlayerId }: Props) {
  if (entries.length === 0) {
    return (
      <p className="text-slate-500 text-sm text-center py-4">No scores yet</p>
    );
  }

  return (
    <ol className="flex flex-col gap-1">
      {entries.map((entry) => (
        <li
          key={entry.playerId}
          className={`flex items-center gap-3 px-4 py-2 rounded-xl ${
            entry.playerId === myPlayerId ? "bg-indigo-900" : "bg-slate-800"
          } ${!entry.isConnected ? "opacity-50" : ""}`}
        >
          <span className="text-slate-400 font-bold w-6 text-sm">
            {entry.isTied ? `=${entry.rank}` : `${entry.rank}`}
          </span>
          <span
            className={`flex-1 text-sm font-medium ${entry.playerId === myPlayerId ? "text-indigo-300" : "text-white"}`}
          >
            {entry.name}
            {!entry.isConnected && " 📵"}
            {entry.playerId === myPlayerId && " (you)"}
          </span>
          <span className="font-bold text-white">{entry.score}</span>
        </li>
      ))}
    </ol>
  );
}
