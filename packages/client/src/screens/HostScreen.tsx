import { useState } from "react";
import type { BuzzMode } from "@buzzroom/shared";
import { useGame } from "../contexts/GameContext.js";
import { useSocket } from "../contexts/SocketContext.js";
import { BuzzOrder } from "../components/BuzzOrder.js";
import { Leaderboard } from "../components/Leaderboard.js";

const MODE_LABELS: Record<BuzzMode, string> = {
  button: "🔴 Button",
  slide: "↔ Slide",
  pattern: "⬡ Pattern",
};

export function HostScreen() {
  const { state, dispatch } = useGame();
  const { socket } = useSocket();
  const [selectedMode, setSelectedMode] = useState<BuzzMode>("button");
  const [awardTarget, setAwardTarget] = useState("");
  const [awardDelta, setAwardDelta] = useState("1");
  // Points a correct answer is worth this round. The protocol has always
  // carried this (AdvanceQueuePayload.points) but the UI never sent it, so
  // every question was hard-wired to 1 point.
  const [roundPoints, setRoundPoints] = useState("1");
  const [tab, setTab] = useState<"round" | "scores">("round");

  const { room, myPlayerId, leaderboard, roundResult } = state;
  if (!room) return null;

  const round = room.round;
  const isRoundOpen = round?.status === "open";

  const openBuzz = () => socket.emit("open_buzz", { buzzMode: selectedMode });
  const closeBuzz = () => socket.emit("close_buzz");
  const resetRound = () => socket.emit("reset_round");
  const advance = (result: "correct" | "wrong") => {
    const parsed = parseInt(roundPoints, 10);
    const points = Number.isNaN(parsed)
      ? 1
      : Math.min(Math.max(parsed, 0), 100);
    socket.emit("advance_queue", { result, points });
  };

  const awardPoints = () => {
    const delta = parseInt(awardDelta, 10);
    if (!awardTarget || isNaN(delta) || delta === 0) return;
    socket.emit("award_points", { playerId: awardTarget, delta });
    setAwardDelta("1");
  };

  const connectedPlayers = room.players.filter((p) => p.isConnected);

  return (
    <div className="flex flex-col flex-1 max-w-lg mx-auto w-full p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-slate-400 text-xs uppercase tracking-wider">
            Room code
          </div>
          <div className="text-3xl font-bold tracking-widest text-white">
            {room.roomCode}
          </div>
        </div>
        <div className="text-right">
          <div className="text-slate-400 text-xs">
            {connectedPlayers.length} player
            {connectedPlayers.length !== 1 ? "s" : ""}
          </div>
          <button
            onClick={() => dispatch({ type: "LEAVE" })}
            className="text-slate-500 hover:text-slate-300 text-xs mt-1"
          >
            End game
          </button>
        </div>
      </div>

      {/* Players waiting (no round) */}
      {!round && (
        <div className="bg-slate-800 rounded-2xl p-4">
          <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">
            Players
          </div>
          <div className="flex flex-wrap gap-2">
            {connectedPlayers.map((p) => (
              <span
                key={p.playerId}
                className="bg-slate-700 text-white text-sm rounded-lg px-3 py-1"
              >
                {p.name} {p.playerId === myPlayerId ? "(you)" : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Round result banner */}
      {roundResult && (
        <div className="bg-green-800 text-white rounded-2xl p-4 text-center">
          <div className="text-2xl font-bold">✓ {roundResult.winnerName}</div>
          <div className="text-green-300 text-sm">
            Correct! +{roundResult.pointsAwarded} pt
            {roundResult.pointsAwarded !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex rounded-xl bg-slate-800 p-1 gap-1">
        {(["round", "scores"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? "bg-slate-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {t === "round" ? "Round" : "Scores"}
          </button>
        ))}
      </div>

      {tab === "round" && (
        <div className="flex flex-col gap-4">
          {/* Mode picker + open button */}
          {!isRoundOpen && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                {(["button", "slide", "pattern"] as BuzzMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setSelectedMode(m)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                      selectedMode === m
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {MODE_LABELS[m]}
                  </button>
                ))}
              </div>
              <button
                onClick={openBuzz}
                className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-lg transition-colors"
              >
                Open buzz
              </button>
            </div>
          )}

          {isRoundOpen && (
            <button
              onClick={closeBuzz}
              className="w-full py-3 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-colors"
            >
              Close buzz window
            </button>
          )}

          {/* Buzz order */}
          {round && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="text-slate-400 text-xs uppercase tracking-wider">
                  Buzz order
                  {round.modeParams.mode !== "button" && (
                    <span className="ml-2 text-indigo-400">
                      {MODE_LABELS[round.modeParams.mode]}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-slate-500 text-xs">
                    Worth
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={roundPoints}
                      onChange={(e) => setRoundPoints(e.target.value)}
                      className="w-12 bg-slate-800 text-white rounded-lg px-2 py-1 text-xs"
                      aria-label="Points for a correct answer"
                    />
                    pts
                  </label>
                  <button
                    onClick={resetRound}
                    className="text-slate-500 hover:text-slate-300 text-xs"
                  >
                    Reset round
                  </button>
                </div>
              </div>

              <BuzzOrder
                buzzOrder={round.buzzOrder}
                activePlayerId={round.activePlayerId}
                myPlayerId={myPlayerId}
                isHost={true}
                onAdvance={advance}
              />
            </div>
          )}
        </div>
      )}

      {tab === "scores" && (
        <div className="flex flex-col gap-4">
          <Leaderboard entries={leaderboard} myPlayerId={myPlayerId} />

          {/* Manual award */}
          <div className="bg-slate-800 rounded-2xl p-4 flex flex-col gap-3">
            <div className="text-slate-400 text-xs uppercase tracking-wider">
              Award points
            </div>
            <select
              value={awardTarget}
              onChange={(e) => setAwardTarget(e.target.value)}
              className="w-full bg-slate-700 text-white rounded-xl px-3 py-2 text-sm"
            >
              <option value="">Select player…</option>
              {room.players.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.name} ({p.score} pts)
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="number"
                value={awardDelta}
                onChange={(e) => setAwardDelta(e.target.value)}
                className="flex-1 bg-slate-700 text-white rounded-xl px-3 py-2 text-sm"
                placeholder="Points (use − to deduct)"
              />
              <button
                onClick={awardPoints}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm"
              >
                Award
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
