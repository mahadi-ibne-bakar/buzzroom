import { useGame } from "../contexts/GameContext.js";
import { useSocket } from "../contexts/SocketContext.js";
import { useClockSync } from "../hooks/useClockSync.js";
import { BuzzOrder } from "../components/BuzzOrder.js";
import { Leaderboard } from "../components/Leaderboard.js";
import { PingIndicator } from "../components/PingIndicator.js";
import { ButtonBuzzer } from "../components/buzz/ButtonBuzzer.js";
import { SlideBuzzer } from "../components/buzz/SlideBuzzer.js";
import { PatternBuzzer } from "../components/buzz/PatternBuzzer.js";
import { useEffect, useState } from "react";
import type { ModeParams } from "@buzzroom/shared";
import { buildBuzzPayload } from "../lib/buildBuzzPayload.js";

/**
 * Counts an early-buzz lockout down to zero, re-rendering roughly ten times a
 * second while it runs and returning null once it has expired. State alone
 * would freeze at the value it had when the penalty arrived.
 */
function useLockoutCountdown(until: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until === null || until <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [until]);

  if (until === null) return null;
  const remainingMs = until - now;
  return remainingMs > 0 ? remainingMs / 1000 : null;
}

export function PlayerScreen() {
  const { state, dispatch } = useGame();
  const { socket, connected } = useSocket();
  const [tab, setTab] = useState<"buzz" | "scores">("buzz");

  const { room, myPlayerId, leaderboard, roundResult, lockout, pings } = state;
  const roundOpen = room?.round?.status === "open";
  const freeBuzz = room?.settings.buzzWindowMode === "free";

  // Sync harder while a round is live; see spec §7.1.
  const offsetRef = useClockSync(socket, connected, roundOpen);
  const lockoutSecondsLeft = useLockoutCountdown(lockout?.until ?? null);

  if (!room) return null;

  const round = room.round;
  const myEntry = round?.buzzOrder.find((e) => e.playerId === myPlayerId);
  const myRank = myEntry && !myEntry.eliminated ? myEntry.rank : null;
  const buzzedIn = myEntry !== undefined;
  // A real buzzer is always pressable; whether the press *counts* is the
  // server's call. Under "free" it always counts. Under "locked" a press on a
  // closed round is what earns the early-buzz penalty (spec §5) -- greying the
  // button out instead would make the penalty, and the whole locked/free
  // distinction, invisible to the player.
  //
  // The exceptions are a resolved round (the question is over) and, under
  // "locked", no round at all: the server has no round to hang a lockout on,
  // so there is nothing to press yet.
  const pressable = roundResult === null && (freeBuzz || round !== null);
  const buzzerDisabled = !pressable || buzzedIn || lockoutSecondsLeft !== null;

  const myPlayer = room.players.find((p) => p.playerId === myPlayerId);

  // Build and emit the buzz payload for the current mode
  const handleBuzz = (localTime: number) => {
    // With no round open this is a free-buzz opener: the server implicitly
    // opens a plain button round on the first buzz, because there were no
    // gesture parameters to broadcast in advance.
    const modeParams: ModeParams = round?.modeParams ?? { mode: "button" };
    socket.emit(
      "buzz",
      buildBuzzPayload(modeParams, localTime, offsetRef.current),
    );
  };

  return (
    <div className="flex flex-col flex-1 max-w-lg mx-auto w-full p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-slate-400 text-xs flex items-center gap-2">
            {room.roomCode}
            <PingIndicator
              rttMs={myPlayerId ? (pings[myPlayerId] ?? myPlayer?.rttMs) : null}
              showMs
            />
          </div>
          <div className="text-white font-semibold">
            {myPlayer?.name ?? "Player"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-slate-400 text-xs">Score</div>
            <div className="text-white font-bold">{myPlayer?.score ?? 0}</div>
          </div>
          <button
            onClick={() => dispatch({ type: "LEAVE" })}
            className="text-slate-500 hover:text-slate-300 text-xs"
          >
            Leave
          </button>
        </div>
      </div>

      {/* Round result banner */}
      {roundResult && (
        <div
          className={`rounded-2xl p-4 text-center ${
            roundResult.winnerPlayerId === myPlayerId
              ? "bg-green-800"
              : "bg-slate-800"
          }`}
        >
          {roundResult.winnerPlayerId === myPlayerId ? (
            <>
              <div className="text-2xl font-bold text-green-300">
                🎉 Correct!
              </div>
              <div className="text-green-400 text-sm">
                +{roundResult.pointsAwarded} pt
                {roundResult.pointsAwarded !== 1 ? "s" : ""}
              </div>
            </>
          ) : (
            <div className="text-slate-300 text-sm">
              <span className="font-semibold text-white">
                {roundResult.winnerName}
              </span>{" "}
              got it right
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex rounded-xl bg-slate-800 p-1 gap-1">
        {(["buzz", "scores"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? "bg-slate-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {t === "buzz" ? "Buzzer" : "Scores"}
          </button>
        ))}
      </div>

      {tab === "buzz" && (
        <div className="flex flex-col items-center gap-6 flex-1 justify-center py-4">
          {!round && !freeBuzz && (
            <div className="text-slate-500 text-center">
              <div className="text-4xl mb-3">⏳</div>
              <div>Waiting for the host to open a round…</div>
            </div>
          )}

          {!round && freeBuzz && (
            <>
              <p className="text-slate-400 text-sm text-center">
                ⚡ Free buzz — go whenever you're ready
              </p>
              <ButtonBuzzer
                onBuzz={handleBuzz}
                disabled={buzzerDisabled}
                myRank={myRank}
                lockoutSecondsLeft={lockoutSecondsLeft}
              />
            </>
          )}

          {round && (
            <>
              {/* Buzzer component for the active mode */}
              {round.modeParams.mode === "button" && (
                <ButtonBuzzer
                  onBuzz={handleBuzz}
                  disabled={buzzerDisabled}
                  myRank={myRank}
                  lockoutSecondsLeft={lockoutSecondsLeft}
                />
              )}
              {round.modeParams.mode === "slide" && (
                <SlideBuzzer
                  onBuzz={handleBuzz}
                  disabled={buzzerDisabled}
                  myRank={myRank}
                  lockoutSecondsLeft={lockoutSecondsLeft}
                />
              )}
              {round.modeParams.mode === "pattern" && (
                <PatternBuzzer
                  sequence={round.modeParams.sequence}
                  onBuzz={handleBuzz}
                  disabled={buzzerDisabled}
                  myRank={myRank}
                  lockoutSecondsLeft={lockoutSecondsLeft}
                />
              )}

              {/* Buzz order below buzzer */}
              {round.buzzOrder.length > 0 && (
                <div className="w-full">
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">
                    Buzz order
                  </div>
                  <BuzzOrder
                    buzzOrder={round.buzzOrder}
                    activePlayerId={round.activePlayerId}
                    myPlayerId={myPlayerId}
                    isHost={false}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === "scores" && (
        <Leaderboard entries={leaderboard} myPlayerId={myPlayerId} />
      )}
    </div>
  );
}
