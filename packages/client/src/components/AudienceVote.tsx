import type { AudienceVote as Vote, VoteTally } from "@buzzroom/shared";

interface Props {
  tally: VoteTally;
  /** The name of whoever is being voted on, for the prompt. */
  activeName: string | null;
  /** Omit to render the tally read-only (host and presenter). */
  onVote?: (vote: Vote) => void;
  /** This viewer's current vote, so the chosen button stays lit. */
  myVote?: Vote | null;
  large?: boolean;
}

/**
 * The audience agree/disagree tally (spec §13).
 *
 * Advisory only — it never moves a score. It gives the host a read on the
 * room before ruling, and gives everyone who isn't answering something to do
 * during the pause.
 */
export function AudienceVote({
  tally,
  activeName,
  onVote,
  myVote,
  large = false,
}: Props) {
  if (tally.activePlayerId === null) return null;

  const total = tally.agree + tally.disagree;
  // Split the bar by share of votes cast, falling back to an even split
  // before anyone has voted so it doesn't lurch on the first click.
  const agreeShare = total === 0 ? 0.5 : tally.agree / total;

  return (
    <div
      className={`bg-slate-800 rounded-2xl flex flex-col ${
        large ? "p-6 gap-4" : "p-4 gap-3"
      }`}
    >
      <div
        className={`text-slate-400 uppercase tracking-wider ${
          large ? "text-lg" : "text-xs"
        }`}
      >
        {activeName ? `Is ${activeName} right?` : "Is that right?"}
      </div>

      {/* Split bar */}
      <div
        className={`flex w-full overflow-hidden rounded-full ${
          large ? "h-6" : "h-3"
        }`}
      >
        <div
          className="bg-green-500 transition-all"
          style={{ width: `${agreeShare * 100}%` }}
        />
        <div
          className="bg-red-500 transition-all"
          style={{ width: `${(1 - agreeShare) * 100}%` }}
        />
      </div>

      <div
        className={`flex items-center justify-between tabular-nums ${
          large ? "text-3xl" : "text-sm"
        }`}
      >
        <span className="text-green-400 font-semibold">👍 {tally.agree}</span>
        <span className="text-red-400 font-semibold">{tally.disagree} 👎</span>
      </div>

      {onVote && (
        <div className="flex gap-2">
          {(["agree", "disagree"] as Vote[]).map((vote) => {
            const chosen = myVote === vote;
            const agree = vote === "agree";
            return (
              <button
                key={vote}
                onClick={() => onVote(vote)}
                className={`flex-1 py-3 rounded-xl font-semibold transition-colors ${
                  chosen
                    ? agree
                      ? "bg-green-600 text-white ring-2 ring-green-300"
                      : "bg-red-600 text-white ring-2 ring-red-300"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {agree ? "👍 Agree" : "👎 Disagree"}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
