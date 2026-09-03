import { useGame } from "../contexts/GameContext.js";
import { useSocket } from "../contexts/SocketContext.js";
import { useClockSync } from "../hooks/useClockSync.js";
import { BuzzOrder } from "../components/BuzzOrder.js";
import { Leaderboard } from "../components/Leaderboard.js";
import { ButtonBuzzer } from "../components/buzz/ButtonBuzzer.js";
import { SlideBuzzer } from "../components/buzz/SlideBuzzer.js";
import { PatternBuzzer } from "../components/buzz/PatternBuzzer.js";
import { useState } from "react";
import type { BuzzPayload } from "@buzzroom/shared";

export function PlayerScreen() {
  const { state, dispatch } = useGame();
  const { socket, connected } = useSocket();
  const offsetRef = useClockSync(socket, connected);
  const [tab, setTab] = useState<"buzz" | "scores">("buzz");

  const { room, myPlayerId, leaderboard, roundResult } = state;
  if (!room) return null;

  const round = room.round;
  const myEntry = round?.buzzOrder.find((e) => e.playerId === myPlayerId);
  const myRank = myEntry && !myEntry.eliminated ? myEntry.rank : null;
  const buzzedIn = myEntry !== undefined;
  const roundOpen = round?.status === "open";
  const buzzerDisabled = !roundOpen || buzzedIn;

  const myPlayer = room.players.find((p) => p.playerId === myPlayerId);

  // Build and emit the buzz payload for the current mode
  const handleBuzz = (localTime: number) => {
    if (!round) return;
    const adjustedTime = localTime + offsetRef.current;
    const mode = round.modeParams.mode;

    let payload: BuzzPayload;
    if (mode === "button") {
      payload = { mode: "button", localTime, adjustedTime };
    } else if (mode === "slide") {
      payload = { mode: "slide", token: round.modeParams.token, localTime, adjustedTime };
    } else {
      payload = {
        mode: "pattern",
        token: round.modeParams.token,
        sequence: round.modeParams.sequence,
        localTime,
        adjustedTime,
      };
    }

    socket.emit("buzz", payload);
  };

  return (
    <div className="flex flex-col flex-1 max-w-lg mx-auto w-full p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-slate-400 text-xs">{room.roomCode}</div>
          <div className="text-white font-semibold">{myPlayer?.name ?? "Player"}</div>
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
            roundResult.winnerPlayerId === myPlayerId ? "bg-green-800" : "bg-slate-800"
          }`}
        >
          {roundResult.winnerPlayerId === myPlayerId ? (
            <>
              <div className="text-2xl font-bold text-green-300">🎉 Correct!</div>
              <div className="text-green-400 text-sm">
                +{roundResult.pointsAwarded} pt
                {roundResult.pointsAwarded !== 1 ? "s" : ""}
              </div>
            </>
          ) : (
            <div className="text-slate-300 text-sm">
              <span className="font-semibold text-white">{roundResult.winnerName}</span>{" "}
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
              tab === t ? "bg-slate-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            {t === "buzz" ? "Buzzer" : "Scores"}
          </button>
        ))}
      </div>

      {tab === "buzz" && (
        <div className="flex flex-col items-center gap-6 flex-1 justify-center py-4">
          {!round && (
            <div className="text-slate-500 text-center">
              <div className="text-4xl mb-3">⏳</div>
              <div>Waiting for the host to open a round…</div>
            </div>
          )}

          {round && (
            <>
              {/* Buzzer component for the active mode */}
              {round.modeParams.mode === "button" && (
                <ButtonBuzzer
                  onBuzz={handleBuzz}
                  disabled={buzzerDisabled}
                  myRank={myRank}
                />
              )}
              {round.modeParams.mode === "slide" && (
                <SlideBuzzer
                  onBuzz={handleBuzz}
                  disabled={buzzerDisabled}
                  myRank={myRank}
                />
              )}
              {round.modeParams.mode === "pattern" && (
                <PatternBuzzer
                  sequence={round.modeParams.sequence}
                  onBuzz={handleBuzz}
                  disabled={buzzerDisabled}
                  myRank={myRank}
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

      {tab === "scores" && <Leaderboard entries={leaderboard} myPlayerId={myPlayerId} />}
    </div>
  );
}
