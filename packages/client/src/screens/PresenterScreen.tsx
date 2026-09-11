import { useGame } from "../contexts/GameContext.js";
import { AudienceVote } from "../components/AudienceVote.js";
import { JoinQrCode } from "../components/JoinQrCode.js";
import { TeamLeaderboard } from "../components/TeamLeaderboard.js";

/**
 * The big-screen view (spec §13): room code and join QR, the live buzz order,
 * and the leaderboard — sized for a TV across the room and carrying no
 * controls at all, so nobody can derail the game by leaning on the keyboard.
 *
 * It attaches over `watch_room`, which takes no seat in the room, so putting
 * a presenter up costs neither a player slot nor a leaderboard row.
 */
export function PresenterScreen() {
  const { state } = useGame();
  const { room, leaderboard, teamLeaderboard, roundResult, voteTally } = state;

  if (!room) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <p className="text-3xl text-slate-500">Connecting to the room…</p>
      </div>
    );
  }

  const round = room.round;
  const live = round?.status === "open";
  const buzzOrder = round?.buzzOrder ?? [];
  const connected = room.players.filter((p) => p.isConnected);

  return (
    <div className="flex flex-col flex-1 p-8 gap-8">
      {/* ── Header: code, QR, live indicator ── */}
      <div className="flex items-start justify-between gap-8">
        <div>
          <div className="text-slate-500 text-xl uppercase tracking-[0.3em]">
            {room.settings.title || "Join at"}
          </div>
          <div className="text-7xl font-bold tracking-[0.2em] text-white mt-1">
            {room.roomCode}
          </div>
          <div className="text-slate-400 text-xl mt-3">
            {connected.length} player{connected.length !== 1 ? "s" : ""} in
            {room.settings.buzzWindowMode === "free" && (
              <span className="text-accent-400"> · ⚡ free buzz</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-8">
          {live && (
            <div className="flex items-center gap-3">
              <span className="w-4 h-4 rounded-full bg-red-500 animate-pulse" />
              <span className="text-2xl font-semibold text-red-400 uppercase tracking-widest">
                Buzz open
              </span>
            </div>
          )}
          <div className="scale-125 origin-top-right">
            <JoinQrCode roomCode={room.roomCode} />
          </div>
        </div>
      </div>

      {/* The question the host is on, when they're using a bank */}
      {room.currentQuestion && !roundResult && (
        <p className="text-4xl text-white font-medium leading-snug">
          {room.currentQuestion}
        </p>
      )}

      {/* ── Round result takes over the screen when one lands ── */}
      {roundResult ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-green-900/40 rounded-3xl">
          <div className="text-3xl text-green-300 uppercase tracking-widest">
            Correct
          </div>
          <div className="text-8xl font-bold text-white text-center px-8">
            {roundResult.winnerName}
          </div>
          <div className="text-4xl text-green-300">
            +{roundResult.pointsAwarded} point
            {roundResult.pointsAwarded !== 1 ? "s" : ""}
          </div>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-2 gap-8 min-h-0">
          {/* ── Buzz order ── */}
          <section className="flex flex-col gap-4 min-h-0">
            <h2 className="text-slate-500 text-xl uppercase tracking-[0.2em]">
              Buzz order
            </h2>
            {room.settings.audienceVoting && (
              <AudienceVote
                tally={voteTally}
                activeName={
                  room.players.find(
                    (p) => p.playerId === voteTally.activePlayerId,
                  )?.name ?? null
                }
                large
              />
            )}
            {buzzOrder.length === 0 ? (
              <p className="text-3xl text-slate-600">
                {round
                  ? "Waiting for a buzz…"
                  : "Waiting for the next question…"}
              </p>
            ) : (
              <ol className="flex flex-col gap-3 overflow-hidden">
                {buzzOrder.map((entry) => {
                  const isActive =
                    entry.playerId === round?.activePlayerId &&
                    !entry.eliminated;
                  return (
                    <li
                      key={entry.playerId}
                      className={`flex items-center gap-5 px-6 py-4 rounded-2xl ${
                        entry.eliminated
                          ? "bg-slate-800/50 opacity-40 line-through"
                          : isActive
                            ? "bg-accent-700 ring-4 ring-accent-400"
                            : "bg-slate-800"
                      }`}
                    >
                      <span className="text-4xl font-bold text-slate-400 w-14">
                        {entry.eliminated ? "✗" : `#${entry.rank}`}
                      </span>
                      <span className="flex-1 text-4xl font-semibold text-white truncate">
                        {entry.playerName}
                      </span>
                      {entry.nearTie && !entry.eliminated && (
                        <span
                          title="Too close to call"
                          className="text-3xl text-amber-400"
                        >
                          ≈
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {/* ── Leaderboard ── */}
          <section className="flex flex-col gap-4 min-h-0">
            <h2 className="text-slate-500 text-xl uppercase tracking-[0.2em]">
              {room.settings.teamsEnabled ? "Teams" : "Scores"}
            </h2>
            {room.settings.teamsEnabled ? (
              <TeamLeaderboard entries={teamLeaderboard} large />
            ) : leaderboard.length === 0 ? (
              <p className="text-3xl text-slate-600">No scores yet</p>
            ) : (
              <ol className="flex flex-col gap-2 overflow-hidden">
                {leaderboard.map((entry) => (
                  <li
                    key={entry.playerId}
                    className={`flex items-center gap-5 px-6 py-3 rounded-2xl bg-slate-800 ${
                      !entry.isConnected ? "opacity-50" : ""
                    }`}
                  >
                    <span className="text-3xl font-bold text-slate-400 w-14">
                      {entry.isTied ? `=${entry.rank}` : entry.rank}
                    </span>
                    <span className="flex-1 text-3xl text-white truncate">
                      {entry.name}
                    </span>
                    <span className="text-4xl font-bold text-white tabular-nums">
                      {entry.score}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
