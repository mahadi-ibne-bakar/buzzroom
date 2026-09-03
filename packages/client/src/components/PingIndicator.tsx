interface Props {
  /** Round-trip time in ms, or null before the player has reported one. */
  rttMs: number | null | undefined;
  /** Render the number alongside the dot, not just the dot. */
  showMs?: boolean;
}

// Thresholds for the dot colour. Buzzing is latency-compensated, so a high
// ping does not actually cost a player the round -- the indicator is here for
// trust and for spotting a genuinely broken connection.
const GOOD_MS = 80;
const FAIR_MS = 200;

function colourFor(rttMs: number): string {
  if (rttMs <= GOOD_MS) return "bg-green-500";
  if (rttMs <= FAIR_MS) return "bg-amber-500";
  return "bg-red-500";
}

export function PingIndicator({ rttMs, showMs = false }: Props) {
  const measured = typeof rttMs === "number";

  return (
    <span
      className="inline-flex items-center gap-1 align-middle"
      title={measured ? `${rttMs} ms round trip` : "Waiting for first sync"}
    >
      <span
        className={`inline-block w-2 h-2 rounded-full ${
          measured ? colourFor(rttMs) : "bg-slate-600"
        }`}
      />
      {showMs && (
        <span className="text-[10px] tabular-nums text-slate-400">
          {measured ? `${rttMs}ms` : "—"}
        </span>
      )}
    </span>
  );
}
