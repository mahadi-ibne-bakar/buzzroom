import type { HistoryEntry } from "../lib/questionBank.js";

interface Props {
  entries: HistoryEntry[];
  onClear: () => void;
}

/**
 * Rounds resolved so far, newest first — including ones from previous
 * sessions, since it's kept on the host's device alongside their questions.
 */
export function GameHistory({ entries, onClear }: Props) {
  return (
    <div className="bg-slate-800 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-xs uppercase tracking-wider">
          History
        </span>
        {entries.length > 0 && (
          <button
            onClick={onClear}
            className="text-slate-500 hover:text-red-400 text-xs"
          >
            Clear
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-slate-500 text-sm">Nothing played yet</p>
      ) : (
        <ol className="flex flex-col gap-1 max-h-56 overflow-y-auto">
          {entries.map((entry) => (
            <li
              key={`${entry.at}-${entry.winnerName}`}
              className="flex items-baseline gap-2 px-3 py-2 rounded-lg bg-slate-700/50 text-sm"
            >
              <span className="flex-1 text-slate-300 truncate">
                {entry.question || (
                  <em className="text-slate-500">No question</em>
                )}
              </span>
              <span className="text-white font-medium shrink-0">
                {entry.winnerName}
              </span>
              <span className="text-green-400 tabular-nums shrink-0">
                +{entry.points}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
