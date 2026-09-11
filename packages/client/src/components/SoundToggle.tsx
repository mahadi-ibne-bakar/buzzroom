import { useState } from "react";
import { isSoundEnabled, setSoundEnabled } from "../lib/sound.js";

/**
 * Mute switch for the game-show sounds. The preference is per-device rather
 * than per-room — whether your phone should make noise is your business, not
 * the host's.
 */
export function SoundToggle() {
  const [on, setOn] = useState(isSoundEnabled);

  return (
    <button
      onClick={() => {
        const next = !on;
        setSoundEnabled(next);
        setOn(next);
      }}
      title={on ? "Mute sounds" : "Unmute sounds"}
      aria-label={on ? "Mute sounds" : "Unmute sounds"}
      aria-pressed={on}
      className="text-slate-500 hover:text-slate-300 text-sm"
    >
      {on ? "🔊" : "🔇"}
    </button>
  );
}
