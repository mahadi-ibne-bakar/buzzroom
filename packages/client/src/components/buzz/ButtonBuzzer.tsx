// ── Button buzz mode ──────────────────────────────────────────────────────
// Uses onPointerDown (not onClick) to capture the earliest possible
// timestamp — onClick fires ~300ms later on mobile after double-tap detection.

interface Props {
  onBuzz: (localTime: number) => void;
  disabled: boolean;
  myRank: number | null;
}

export function ButtonBuzzer({ onBuzz, disabled, myRank }: Props) {
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
              : disabled
                ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-500 active:scale-95 active:bg-indigo-700 text-white cursor-pointer shadow-lg shadow-indigo-900"
          }
        `}
      >
        {myRank !== null ? `#${myRank} 🎉` : disabled ? "Locked" : "BUZZ"}
      </button>
    </div>
  );
}
