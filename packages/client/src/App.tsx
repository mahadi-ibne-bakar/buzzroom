import { useEffect } from "react";
import { SocketProvider, useSocket } from "./contexts/SocketContext.js";
import { GameProvider, useGame } from "./contexts/GameContext.js";
import { LandingScreen } from "./screens/LandingScreen.js";
import { HostScreen } from "./screens/HostScreen.js";
import { PlayerScreen } from "./screens/PlayerScreen.js";
import { PresenterScreen } from "./screens/PresenterScreen.js";

function AppShell() {
  const { state, dispatch } = useGame();
  const { connected } = useSocket();

  // The accent is a room setting, so every screen in a game recolours
  // together. Set on <html> rather than a wrapper so it also reaches the
  // page background painted outside the React tree.
  const accent = state.room?.settings.accent ?? "indigo";
  useEffect(() => {
    const root = document.documentElement;
    // Transitions are suppressed across the swap: a colour transition does
    // not fire when the new colour arrives through a changed custom
    // property, so transitioned elements keep painting the previous accent
    // until some unrelated recalc knocks them loose. Restored on the next
    // frame, once the new colour has been painted.
    root.classList.add("accent-switching");
    root.dataset.accent = accent;
    const frame = requestAnimationFrame(() =>
      root.classList.remove("accent-switching"),
    );
    return () => cancelAnimationFrame(frame);
  }, [accent]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Error toast */}
      {state.errorMessage && (
        <div
          className="fixed top-4 left-4 right-4 z-50 bg-red-600 text-white rounded-xl px-4 py-3 text-sm font-medium shadow-lg flex justify-between items-center"
          onClick={() => dispatch({ type: "CLEAR_ERROR" })}
        >
          <span>{state.errorMessage}</span>
          <span className="ml-4 opacity-70">✕</span>
        </div>
      )}

      {/* Host-left banner (player view) */}
      {state.hostGone && state.screen === "player" && (
        <div className="bg-amber-700 text-white text-sm text-center py-2 px-4">
          The host has disconnected — waiting for them to reconnect…
        </div>
      )}

      {/* Connection lost banner */}
      {!connected && state.screen !== "landing" && (
        <div className="bg-slate-700 text-slate-300 text-sm text-center py-2 px-4 animate-pulse">
          Reconnecting…
        </div>
      )}

      {state.screen === "landing" && <LandingScreen />}
      {state.screen === "host" && <HostScreen />}
      {state.screen === "player" && <PlayerScreen />}
      {state.screen === "presenter" && <PresenterScreen />}
    </div>
  );
}

export default function App() {
  return (
    <SocketProvider>
      <GameProvider>
        <AppShell />
      </GameProvider>
    </SocketProvider>
  );
}
