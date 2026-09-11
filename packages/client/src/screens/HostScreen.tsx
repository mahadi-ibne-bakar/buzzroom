import { useEffect, useRef, useState } from "react";
import { ACCENTS, type BuzzMode, type BuzzWindowMode } from "@buzzroom/shared";
import { useGame } from "../contexts/GameContext.js";
import { useSocket } from "../contexts/SocketContext.js";
import { useClockSync } from "../hooks/useClockSync.js";
import {
  appendHistory,
  clearHistory,
  loadHistory,
  type HistoryEntry,
} from "../lib/questionBank.js";
import { AudienceVote } from "../components/AudienceVote.js";
import { BuzzOrder } from "../components/BuzzOrder.js";
import { JoinQrCode } from "../components/JoinQrCode.js";
import { Leaderboard } from "../components/Leaderboard.js";
import { PingIndicator } from "../components/PingIndicator.js";
import { GameHistory } from "../components/GameHistory.js";
import { QuestionBank } from "../components/QuestionBank.js";
import { SoundToggle } from "../components/SoundToggle.js";
import { TeamLeaderboard } from "../components/TeamLeaderboard.js";
import { TeamManager } from "../components/TeamManager.js";

const MODE_LABELS: Record<BuzzMode, string> = {
  button: "🔴 Button",
  slide: "↔ Slide",
  pattern: "⬡ Pattern",
};

export function HostScreen() {
  const { state, dispatch } = useGame();
  const { socket, connected } = useSocket();
  // The host never buzzes, so they don't need the offset -- but syncing is
  // what produces an RTT, and a blank connection dot for yourself in the
  // player list is worse than useless. Idle cadence is enough.
  useClockSync(socket, connected, false);
  const [selectedMode, setSelectedMode] = useState<BuzzMode>("button");
  const [awardTarget, setAwardTarget] = useState("");
  const [awardDelta, setAwardDelta] = useState("1");
  // Points a correct answer is worth this round. The protocol has always
  // carried this (AdvanceQueuePayload.points) but the UI never sent it, so
  // every question was hard-wired to 1 point.
  const [roundPoints, setRoundPoints] = useState("1");
  const [tab, setTab] = useState<"round" | "scores" | "prep">("round");
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);

  const {
    room,
    myPlayerId,
    leaderboard,
    teamLeaderboard,
    roundResult,
    pings,
    voteTally,
  } = state;
  if (!room) return null;

  // Log each resolved round once. Keyed on the result object identity rather
  // than a field, because the same player can win consecutive rounds with the
  // same points on the same question.
  const loggedResult = useRef<object | null>(null);
  useEffect(() => {
    if (!roundResult || loggedResult.current === roundResult) return;
    loggedResult.current = roundResult;
    setHistory(
      appendHistory({
        at: Date.now(),
        question: room?.currentQuestion ?? "",
        winnerName: roundResult.winnerName,
        points: roundResult.pointsAwarded,
      }),
    );
  }, [roundResult, room?.currentQuestion]);

  const votedOnName =
    room.players.find((p) => p.playerId === voteTally.activePlayerId)?.name ??
    null;

  const settings = room.settings;
  const setWindowMode = (buzzWindowMode: BuzzWindowMode) =>
    socket.emit("update_settings", { buzzWindowMode });

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
          <div className="flex items-center justify-end gap-2 mt-1">
            <SoundToggle />
            <button
              onClick={() => dispatch({ type: "LEAVE" })}
              className="text-slate-500 hover:text-slate-300 text-xs"
            >
              End game
            </button>
          </div>
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
                className="bg-slate-700 text-white text-sm rounded-lg px-3 py-1 inline-flex items-center gap-2"
              >
                <PingIndicator rttMs={pings[p.playerId] ?? p.rttMs} showMs />
                {p.name} {p.playerId === myPlayerId ? "(you)" : ""}
              </span>
            ))}
          </div>

          <div className="mt-4 flex flex-col items-center gap-3">
            <JoinQrCode roomCode={room.roomCode} />
            <a
              href={`/?present=${room.roomCode}`}
              target="_blank"
              rel="noreferrer"
              className="text-accent-400 hover:text-accent-300 text-xs underline"
            >
              Open presenter view ↗
            </a>
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
        {(["round", "scores", "prep"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? "bg-slate-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {t === "round" ? "Round" : t === "scores" ? "Scores" : "Prep"}
          </button>
        ))}
      </div>

      {tab === "round" && (
        <div className="flex flex-col gap-4">
          {/* Buzz window mode (spec §5) */}
          <div className="bg-slate-800 rounded-2xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-xs uppercase tracking-wider">
                Buzz window
              </span>
              <div className="flex rounded-lg bg-slate-900 p-0.5 gap-0.5">
                {(["locked", "free"] as BuzzWindowMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setWindowMode(m)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      settings.buzzWindowMode === m
                        ? "bg-slate-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {m === "locked" ? "🔒 Locked" : "⚡ Free"}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-slate-500 text-xs">
              {settings.buzzWindowMode === "locked"
                ? "Buzzes only count while the window is open. Buzzing early earns a short lockout."
                : "Players can buzz any time, before you open the round or after you close it. No early-buzz penalty."}
            </p>
            {/* Branding: shown instead of "Join at" on the presenter screen */}
            <input
              value={settings.title}
              onChange={(e) =>
                socket.emit("update_settings", { title: e.target.value })
              }
              placeholder="Room title (shown on the big screen)"
              maxLength={40}
              className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-accent-500"
            />

            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-xs">Colour</span>
              {ACCENTS.map((a) => (
                <button
                  key={a}
                  onClick={() => socket.emit("update_settings", { accent: a })}
                  title={a}
                  aria-label={`${a} accent`}
                  aria-pressed={settings.accent === a}
                  data-accent={a}
                  className={`w-5 h-5 rounded-full bg-accent-500 transition-transform ${
                    settings.accent === a
                      ? "ring-2 ring-white scale-110"
                      : "opacity-60 hover:opacity-100"
                  }`}
                />
              ))}
            </div>

            <label className="flex items-center gap-2 text-slate-400 text-xs">
              <input
                type="checkbox"
                checked={settings.audienceVoting}
                onChange={(e) =>
                  socket.emit("update_settings", {
                    audienceVoting: e.target.checked,
                  })
                }
                className="accent-accent-500"
              />
              Audience voting
            </label>
            <label className="flex items-center gap-2 text-slate-400 text-xs">
              <input
                type="checkbox"
                checked={settings.teamsEnabled}
                onChange={(e) =>
                  socket.emit("update_settings", {
                    teamsEnabled: e.target.checked,
                  })
                }
                className="accent-accent-500"
              />
              Team mode
            </label>
            <label className="flex items-center gap-2 text-slate-400 text-xs">
              <input
                type="checkbox"
                checked={settings.earlyBuzzPenalty}
                disabled={settings.buzzWindowMode === "free"}
                onChange={(e) =>
                  socket.emit("update_settings", {
                    earlyBuzzPenalty: e.target.checked,
                  })
                }
                className="accent-accent-500 disabled:opacity-40"
              />
              <span
                className={
                  settings.buzzWindowMode === "free" ? "opacity-40" : ""
                }
              >
                Early-buzz penalty
              </span>
            </label>
          </div>

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
                        ? "bg-accent-600 text-white"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {MODE_LABELS[m]}
                  </button>
                ))}
              </div>
              <button
                onClick={openBuzz}
                className="w-full py-4 rounded-2xl bg-accent-600 hover:bg-accent-500 active:bg-accent-700 text-white font-bold text-lg transition-colors"
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

          {room.currentQuestion && (
            <p className="bg-slate-800 rounded-2xl p-4 text-white">
              {room.currentQuestion}
            </p>
          )}

          {settings.audienceVoting && (
            <AudienceVote tally={voteTally} activeName={votedOnName} />
          )}

          {/* Buzz order */}
          {round && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="text-slate-400 text-xs uppercase tracking-wider">
                  Buzz order
                  {round.modeParams.mode !== "button" && (
                    <span className="ml-2 text-accent-400">
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

      {tab === "prep" && (
        <div className="flex flex-col gap-4">
          <QuestionBank
            currentQuestion={room.currentQuestion}
            onSelect={(text) => socket.emit("set_question", { text })}
          />
          <GameHistory
            entries={history}
            onClear={() => {
              clearHistory();
              setHistory([]);
            }}
          />
        </div>
      )}

      {tab === "scores" && (
        <div className="flex flex-col gap-4">
          {settings.teamsEnabled && (
            <TeamLeaderboard entries={teamLeaderboard} />
          )}

          {settings.teamsEnabled && (
            <TeamManager
              teams={room.teams}
              players={room.players}
              onCreate={(name) => socket.emit("create_team", { name })}
              onDelete={(teamId) => socket.emit("delete_team", { teamId })}
              onAssign={(playerId, teamId) =>
                socket.emit("assign_team", { playerId, teamId })
              }
            />
          )}

          <Leaderboard
            entries={leaderboard}
            myPlayerId={myPlayerId}
            pings={pings}
          />

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
                className="px-4 py-2 rounded-xl bg-accent-600 hover:bg-accent-500 text-white font-semibold text-sm"
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
