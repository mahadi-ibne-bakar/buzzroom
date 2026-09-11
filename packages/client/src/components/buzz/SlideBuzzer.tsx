import { useEffect, useRef, useState } from "react";

interface Props {
  onBuzz: (localTime: number) => void;
  disabled: boolean;
  myRank: number | null;
  /** Seconds left on an early-buzz penalty, or null when not locked out. */
  lockoutSecondsLeft: number | null;
}

const COMPLETION_THRESHOLD = 0.88; // 88% of track width counts as "done"
const THUMB_WIDTH_PX = 56;

export function SlideBuzzer({
  onBuzz,
  disabled,
  myRank,
  lockoutSecondsLeft,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0); // 0–1
  const dragging = useRef(false);
  const buzzed = useRef(false);
  const lockedOut = lockoutSecondsLeft !== null;

  // Measured rather than read off the ref during render: on the first render
  // the ref is still null, which pinned the thumb to the left edge, and a
  // render-phase read never re-runs when the viewport changes.
  const [trackWidth, setTrackWidth] = useState(0);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setTrackWidth(entry!.contentRect.width);
    });
    observer.observe(el);
    setTrackWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const travel = Math.max(0, trackWidth - THUMB_WIDTH_PX);

  const startX = useRef(0);

  const reset = () => {
    dragging.current = false;
    setProgress(0);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled || myRank !== null) return;
    e.preventDefault();
    dragging.current = true;
    buzzed.current = false;
    startX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || travel === 0) return;
    const delta = e.clientX - startX.current;
    const clamped = Math.max(0, Math.min(delta, travel));
    const p = clamped / travel;
    setProgress(p);

    if (p >= COMPLETION_THRESHOLD && !buzzed.current) {
      buzzed.current = true;
      dragging.current = false;
      onBuzz(Date.now());
    }
  };

  const handlePointerUp = () => {
    if (!buzzed.current) reset();
  };

  const completed = myRank !== null;

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm px-4">
      <p className={`text-sm ${lockedOut ? "text-red-400" : "text-slate-400"}`}>
        {lockedOut
          ? `Too early — locked out for ${lockoutSecondsLeft.toFixed(1)}s`
          : "Slide to buzz in"}
      </p>

      <div
        ref={trackRef}
        className={`relative w-full h-14 rounded-full select-none no-select ${
          completed
            ? "bg-green-700"
            : disabled
              ? "bg-slate-700"
              : "bg-slate-700"
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={reset}
      >
        {/* Fill */}
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-none ${
            completed ? "bg-green-500" : "bg-accent-600"
          }`}
          style={{ width: completed ? "100%" : `${progress * 100}%` }}
        />

        {/* Thumb */}
        <div
          className={`absolute top-1 bottom-1 w-12 rounded-full flex items-center justify-center text-white font-bold shadow-md ${
            completed
              ? "bg-green-400"
              : lockedOut
                ? "bg-red-700 cursor-not-allowed"
                : disabled
                  ? "bg-slate-500 cursor-not-allowed"
                  : "bg-accent-400 cursor-grab active:cursor-grabbing"
          }`}
          style={{
            left: completed
              ? `${travel + 4}px`
              : `${Math.max(4, progress * travel)}px`,
          }}
        >
          {completed ? `#${myRank}` : "→"}
        </div>
      </div>
    </div>
  );
}
