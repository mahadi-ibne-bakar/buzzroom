/**
 * The host's question bank and game history.
 *
 * Both live in the host's own browser rather than on the server. Questions
 * are the host's material and the one thing in this app worth keeping
 * between sessions — and v1 deliberately runs with no database, so storing
 * them server-side would mean either losing them on restart or introducing
 * persistence the rest of the app doesn't need. localStorage keeps them
 * exactly where they're used, on the device that runs the game.
 *
 * Every read and write is guarded: private browsing, cleared site data and
 * "block site data" settings all make localStorage throw rather than return
 * empty.
 */

const QUESTIONS_KEY = "buzzroom-questions";
const HISTORY_KEY = "buzzroom-history";
const MAX_HISTORY = 200;

export interface Question {
  id: string;
  text: string;
}

export interface HistoryEntry {
  at: number;
  question: string;
  winnerName: string;
  points: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    // Unreadable or corrupt: behave as if there were nothing stored rather
    // than taking the host's screen down over it.
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Out of quota, or storage blocked. The in-memory copy still works for
    // this session; it just won't survive a reload.
  }
}

// ── Questions ─────────────────────────────────────────────────────────────

export function loadQuestions(): Question[] {
  return read<Question[]>(QUESTIONS_KEY, []);
}

export function saveQuestions(questions: Question[]): void {
  write(QUESTIONS_KEY, questions);
}

/**
 * Splits pasted text into questions, one per non-blank line.
 *
 * Hosts overwhelmingly already have their questions written down somewhere,
 * so pasting a list beats typing them in one at a time. Leading numbering
 * ("1.", "2)", "-") is stripped, since a copied list almost always carries
 * it and nobody wants it read back to them.
 */
export function parseQuestions(text: string): Question[] {
  return text
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^(\d+[.)]|[-*•])\s*/, "")
        .trim(),
    )
    .filter((line) => line.length > 0)
    .map((line) => ({ id: crypto.randomUUID(), text: line.slice(0, 300) }));
}

// ── History ───────────────────────────────────────────────────────────────

export function loadHistory(): HistoryEntry[] {
  return read<HistoryEntry[]>(HISTORY_KEY, []);
}

/**
 * Appends a resolved round, newest first, capped so a long-running host
 * doesn't fill their storage quota.
 */
export function appendHistory(entry: HistoryEntry): HistoryEntry[] {
  const next = [entry, ...loadHistory()].slice(0, MAX_HISTORY);
  write(HISTORY_KEY, next);
  return next;
}

export function clearHistory(): void {
  write(HISTORY_KEY, []);
}
