import { useState } from "react";
import { useSocket } from "../contexts/SocketContext.js";
import { parseRoomCodeFromSearch } from "../lib/joinLink.js";

export function LandingScreen() {
  const { socket } = useSocket();
  // A scanned QR code lands here as /?room=ABCDEF (see JoinQrCode). Read it
  // once on first render so the join form opens pre-filled and the player
  // only has to type a name.
  const [scannedCode] = useState(() =>
    parseRoomCodeFromSearch(window.location.search),
  );

  const [mode, setMode] = useState<"home" | "host" | "join">(
    scannedCode ? "join" : "home",
  );
  const [name, setName] = useState("");
  const [code, setCode] = useState(scannedCode);
  const [busy, setBusy] = useState(false);

  const handleHost = () => {
    if (!name.trim()) return;
    setBusy(true);
    socket.connect();
    socket.once("connect", () => {
      socket.emit("create_room", { hostName: name.trim() });
    });
  };

  const handleJoin = () => {
    if (!name.trim() || code.length !== 6) return;
    setBusy(true);
    socket.connect();
    socket.once("connect", () => {
      socket.emit("join_room", {
        roomCode: code.toUpperCase(),
        playerName: name.trim(),
      });
    });
  };

  if (mode === "home") {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-8 p-8">
        <div className="text-center">
          <div className="text-6xl mb-4">⚡</div>
          <h1 className="text-4xl font-bold text-white">BuzzRoom</h1>
          <p className="mt-2 text-slate-400">Fair buzzer for game nights</p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => setMode("host")}
            className="w-full py-4 rounded-2xl bg-accent-600 hover:bg-accent-500 active:bg-accent-700 text-white font-semibold text-lg transition-colors"
          >
            Host a game
          </button>
          <button
            onClick={() => setMode("join")}
            className="w-full py-4 rounded-2xl bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-white font-semibold text-lg transition-colors"
          >
            Join a game
          </button>
        </div>
      </div>
    );
  }

  const isHost = mode === "host";

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 p-8">
      <button
        onClick={() => {
          setMode("home");
          setBusy(false);
        }}
        className="self-start text-slate-400 hover:text-white text-sm"
      >
        ← Back
      </button>
      <h2 className="text-2xl font-bold text-white">
        {isHost ? "Host a game" : "Join a game"}
      </h2>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <div>
          <label className="block text-slate-400 text-sm mb-1">Your name</label>
          <input
            className="w-full bg-slate-800 text-white rounded-xl px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-accent-500"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoFocus
          />
        </div>

        {!isHost && (
          <div>
            <label className="block text-slate-400 text-sm mb-1">
              Room code
            </label>
            <input
              className="w-full bg-slate-800 text-white rounded-xl px-4 py-3 text-lg tracking-widest uppercase outline-none focus:ring-2 focus:ring-accent-500"
              placeholder="6-letter code"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.toUpperCase().slice(0, 6))
              }
              maxLength={6}
            />
          </div>
        )}

        <button
          onClick={isHost ? handleHost : handleJoin}
          disabled={busy || !name.trim() || (!isHost && code.length !== 6)}
          className="w-full py-4 rounded-2xl bg-accent-600 hover:bg-accent-500 active:bg-accent-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-lg transition-colors"
        >
          {busy ? "Connecting…" : isHost ? "Create room" : "Join room"}
        </button>
      </div>
    </div>
  );
}
