import { useState } from "react";

interface Props {
  sequence: number[]; // dot indices the player must tap in order
  onBuzz: (localTime: number) => void;
  disabled: boolean;
  myRank: number | null;
  /** Seconds left on an early-buzz penalty, or null when not locked out. */
  lockoutSecondsLeft: number | null;
}

export function PatternBuzzer({
  sequence,
  onBuzz,
  disabled,
  myRank,
  lockoutSecondsLeft,
}: Props) {
  const [tapped, setTapped] = useState<number[]>([]);
  const [failed, setFailed] = useState(false);
  const completed = myRank !== null;
  const lockedOut = lockoutSecondsLeft !== null;

  const handleTap = (dotIndex: number) => {
    if (disabled || completed || failed) return;

    const nextExpected = sequence[tapped.length];
    if (dotIndex !== nextExpected) {
      // Wrong dot — shake and reset
      setFailed(true);
      setTimeout(() => {
        setFailed(false);
        setTapped([]);
      }, 600);
      return;
    }

    const newTapped = [...tapped, dotIndex];
    setTapped(newTapped);

    if (newTapped.length === sequence.length) {
      // Pattern complete — buzz fires at this exact moment
      onBuzz(Date.now());
    }
  };

  const stepNumber = (dotIndex: number) => {
    const pos = sequence.indexOf(dotIndex);
    return pos === -1 ? null : pos + 1; // 1-based step label
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <p className={`text-sm ${lockedOut ? "text-red-400" : "text-slate-400"}`}>
        {completed
          ? `Rank #${myRank} 🎉`
          : lockedOut
            ? `Too early — locked out for ${lockoutSecondsLeft.toFixed(1)}s`
            : failed
              ? "Wrong dot — try again"
              : `Tap dots in order (${tapped.length}/${sequence.length})`}
      </p>

      {/* 3×3 grid */}
      <div
        className={`grid grid-cols-3 gap-4 p-4 rounded-2xl transition-all ${
          failed || lockedOut ? "bg-red-900" : "bg-slate-800"
        }`}
      >
        {Array.from({ length: 9 }, (_, dotIndex) => {
          const step = stepNumber(dotIndex);
          const isTapped = tapped.includes(dotIndex);
          const isNext = sequence[tapped.length] === dotIndex;

          return (
            <button
              key={dotIndex}
              onPointerDown={(e) => {
                e.preventDefault();
                handleTap(dotIndex);
              }}
              disabled={disabled || completed}
              className={`
                w-16 h-16 rounded-full flex items-center justify-center
                font-bold text-lg select-none no-select transition-all
                ${
                  completed
                    ? "bg-green-600 text-white"
                    : isTapped
                      ? "bg-accent-600 text-white scale-95"
                      : isNext && !failed
                        ? "bg-accent-900 text-accent-300 ring-2 ring-accent-400 animate-pulse"
                        : step !== null
                          ? "bg-slate-700 text-slate-300 cursor-pointer hover:bg-slate-600"
                          : "bg-slate-700 text-slate-600 cursor-not-allowed opacity-30"
                }
              `}
            >
              {step !== null ? step : "·"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
