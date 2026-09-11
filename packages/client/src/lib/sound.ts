/**
 * Game-show sounds, synthesised with the Web Audio API rather than shipped as
 * audio files.
 *
 * Why synthesise: no binary assets in the repo, no licensing question over
 * sampled sounds, nothing extra to download on a phone before the first
 * round, and every cue is a couple of lines to tune.
 *
 * Everything here is best-effort. Audio is a garnish — if a browser blocks
 * it, has no Web Audio, or the context won't resume, the game carries on
 * silently and no call site has to care.
 */

declare global {
  interface Window {
    // Safari only exposed the prefixed constructor until 14.1, and iOS
    // Safari is the single most likely browser for a player's phone.
    webkitAudioContext?: typeof AudioContext;
  }
}

const STORAGE_KEY = "buzzroom-sound";

let context: AudioContext | null = null;
let enabled = readEnabled();

function readEnabled(): boolean {
  try {
    // Default on: the sound is most of the game-show feel, and there's a
    // visible toggle for anyone who disagrees.
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    // Private browsing and blocked site data both throw here.
    return true;
  }
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(next: boolean): void {
  enabled = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
  } catch {
    // Preference just won't survive the reload; not worth surfacing.
  }
}

/**
 * Browsers refuse to start an AudioContext outside a user gesture, so the
 * context is created on first use — by which point the player has tapped
 * something — and resumed if it was suspended.
 */
function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  const Ctor = window.AudioContext ?? window.webkitAudioContext;
  if (!Ctor) return null;

  try {
    context ??= new Ctor();
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

interface Note {
  /** Hz. */
  freq: number;
  /** Seconds from the start of the cue. */
  at: number;
  /** Seconds. */
  duration: number;
  type?: OscillatorType;
  gain?: number;
}

function play(notes: Note[]): void {
  if (!enabled) return;

  const ctx = getContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  for (const note of notes) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();

    osc.type = note.type ?? "sine";
    osc.frequency.setValueAtTime(note.freq, now + note.at);

    // A short attack and exponential decay: a raw gate on a square wave
    // clicks audibly at both ends.
    const peak = note.gain ?? 0.18;
    amp.gain.setValueAtTime(0.0001, now + note.at);
    amp.gain.exponentialRampToValueAtTime(peak, now + note.at + 0.01);
    amp.gain.exponentialRampToValueAtTime(
      0.0001,
      now + note.at + note.duration,
    );

    osc.connect(amp).connect(ctx.destination);
    osc.start(now + note.at);
    osc.stop(now + note.at + note.duration + 0.02);
  }
}

/** Two rising notes: the window is open, go. */
export function playRoundOpen(): void {
  play([
    { freq: 587.33, at: 0, duration: 0.1 }, // D5
    { freq: 880, at: 0.1, duration: 0.16 }, // A5
  ]);
}

/** Your own buzz landed. Short and bright so it reads as "registered". */
export function playBuzz(): void {
  play([{ freq: 1046.5, at: 0, duration: 0.12, type: "triangle" }]);
}

/** Correct answer: a major triad, the most unambiguous "yes" there is. */
export function playCorrect(): void {
  play([
    { freq: 523.25, at: 0, duration: 0.12 }, // C5
    { freq: 659.25, at: 0.1, duration: 0.12 }, // E5
    { freq: 783.99, at: 0.2, duration: 0.28 }, // G5
  ]);
}

/** Wrong answer: a flat descending pair. */
export function playWrong(): void {
  play([
    { freq: 220, at: 0, duration: 0.14, type: "square", gain: 0.1 },
    { freq: 155.56, at: 0.12, duration: 0.24, type: "square", gain: 0.1 },
  ]);
}

/** Early buzz: a low rasp, deliberately unpleasant. */
export function playPenalty(): void {
  play([
    { freq: 110, at: 0, duration: 0.28, type: "sawtooth", gain: 0.09 },
    { freq: 104, at: 0, duration: 0.28, type: "sawtooth", gain: 0.09 },
  ]);
}
