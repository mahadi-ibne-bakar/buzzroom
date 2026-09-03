import type { BuzzEntryView } from "@buzzroom/shared";

interface Props {
  buzzOrder: BuzzEntryView[];
  activePlayerId: string | null;
  myPlayerId: string | null;
  isHost: boolean;
  onAdvance?: (result: "correct" | "wrong") => void;
}

export function BuzzOrder({
  buzzOrder,
  activePlayerId,
  myPlayerId,
  isHost,
  onAdvance,
}: Props) {
  if (buzzOrder.length === 0) {
    return <p className="text-slate-500 text-sm text-center py-4">No buzzes yet…</p>;
  }

  return (
    <ol className="flex flex-col gap-2">
      {buzzOrder.map((entry) => {
        const isActive = entry.playerId === activePlayerId && !entry.eliminated;
        const isMe = entry.playerId === myPlayerId;

        return (
          <li
            key={entry.playerId}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              entry.eliminated
                ? "bg-slate-800 opacity-40 line-through"
                : isActive
                  ? "bg-indigo-700 ring-2 ring-indigo-400"
                  : "bg-slate-800"
            }`}
          >
            <span className="text-lg font-bold text-slate-400 w-6">
              {entry.eliminated ? "✗" : `#${entry.rank}`}
            </span>

            <span
              className={`flex-1 font-semibold ${isMe ? "text-indigo-300" : "text-white"}`}
            >
              {entry.playerName}
              {isMe && " (you)"}
            </span>

            {entry.nearTie && !entry.eliminated && (
              <span
                title="Near-tie — within 50ms of adjacent player"
                className="text-amber-400 text-xs"
              >
                ≈
              </span>
            )}

            <span className="text-xs text-slate-500 uppercase">{entry.mode}</span>

            {isHost && isActive && onAdvance && (
              <div className="flex gap-2 ml-2">
                <button
                  onClick={() => onAdvance("correct")}
                  className="px-3 py-1 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-semibold"
                >
                  ✓
                </button>
                <button
                  onClick={() => onAdvance("wrong")}
                  className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold"
                >
                  ✗
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
