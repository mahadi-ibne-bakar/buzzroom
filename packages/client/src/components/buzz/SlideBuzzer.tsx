import { useRef, useState } from "react";

interface Props {
  onBuzz: (localTime: number) => void;
  disabled: boolean;
  myRank: number | null;
}

const COMPLETION_THRESHOLD = 0.88; // 88% of track width counts as "done"

export function SlideBuzzer({ onBuzz, disabled, myRank }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0); // 0–1
  const dragging = useRef(false);
  const buzzed = useRef(false);

  const startX = useRef(0);
  const thumbLeft = useRef(0);

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
    thumbLeft.current = 0;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !trackRef.current) return;
    const trackWidth = trackRef.current.clientWidth - 56; // subtract thumb width
    const delta = e.clientX - startX.current;
    const clamped = Math.max(0, Math.min(delta, trackWidth));
    const p = clamped / trackWidth;
    thumbLeft.current = clamped;
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
      <p className="text-slate-400 text-sm">Slide to buzz in</p>

      <div
        ref={trackRef}
        className={`relative w-full h-14 rounded-full select-none no-select ${
          completed ? "bg-green-700" : disabled ? "bg-slate-700" : "bg-slate-700"
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={reset}
      >
        {/* Fill */}
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-none ${
            completed ? "bg-green-500" : "bg-indigo-600"
          }`}
          style={{ width: completed ? "100%" : `${progress * 100}%` }}
        />

        {/* Thumb */}
        <div
          className={`absolute top-1 bottom-1 w-12 rounded-full flex items-center justify-center text-white font-bold shadow-md ${
            completed
              ? "bg-green-400"
              : disabled
                ? "bg-slate-500 cursor-not-allowed"
                : "bg-indigo-400 cursor-grab active:cursor-grabbing"
          }`}
          style={{
            left: completed
              ? "calc(100% - 52px)"
              : `${Math.max(4, progress * (trackRef.current ? trackRef.current.clientWidth - 56 : 0))}px`,
          }}
        >
          {completed ? `#${myRank}` : "→"}
        </div>
      </div>
    </div>
  );
}
