// ── Button buzz mode ──────────────────────────────────────────────────────
// Uses onPointerDown (not onClick) to capture the earliest possible
// timestamp — onClick fires ~300ms later on mobile after double-tap detection.

interface Props {
  onBuzz: (localTime: number) => void;
  disabled: boolean;
  myRank: number | null;
  /** Seconds left on an early-buzz penalty, or null when not locked out. */
  lockoutSecondsLeft: number | null;
}

export function ButtonBuzzer({
  onBuzz,
  disabled,
  myRank,
  lockoutSecondsLeft,
}: Props) {
  const lockedOut = lockoutSecondsLeft !== null;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    onBuzz(Date.now());
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <button
        onPointerDown={handlePointerDown}
        disabled={disabled}
        className={`
          w-56 h-56 rounded-full font-bold text-2xl select-none transition-all
          touch-action-none no-select
          ${
            myRank !== null
              ? "bg-green-600 text-white scale-95 cursor-default"
              : lockedOut
                ? "bg-red-900 text-red-300 cursor-not-allowed animate-pulse"
                : disabled
                  ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                  : "bg-accent-600 hover:bg-accent-500 active:scale-95 active:bg-accent-700 text-white cursor-pointer shadow-lg shadow-accent-900"
          }
        `}
      >
        {myRank !== null
          ? `#${myRank} 🎉`
          : lockedOut
            ? `${lockoutSecondsLeft.toFixed(1)}s`
            : disabled
              ? "Locked"
              : "BUZZ"}
      </button>

      {lockedOut && (
        <p className="text-red-400 text-sm text-center">
          Too early — locked out for a moment
        </p>
      )}
    </div>
  );
}
