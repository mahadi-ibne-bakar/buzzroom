import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendHistory,
  clearHistory,
  loadHistory,
  loadQuestions,
  parseQuestions,
  saveQuestions,
} from "../lib/questionBank.js";

/**
 * An in-memory stand-in for localStorage.
 *
 * jsdom serves the tests from an opaque origin and so provides no storage at
 * all, and Node's own experimental localStorage throws unless the runtime was
 * started with --localstorage-file. Stubbing sidesteps both and lets the
 * failure paths be tested directly, which is the part actually worth pinning
 * down: every read and write in questionBank is guarded.
 */
function memoryStorage(overrides: Partial<Storage> = {}): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
    ...overrides,
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

// ── parsing pasted lists ──────────────────────────────────────────────────

describe("parseQuestions", () => {
  it("takes one question per non-blank line", () => {
    expect(parseQuestions("First?\nSecond?").map((q) => q.text)).toEqual([
      "First?",
      "Second?",
    ]);
  });

  it("drops blank lines and surrounding whitespace", () => {
    expect(
      parseQuestions("  First?  \n\n\n   \nSecond?\n").map((q) => q.text),
    ).toEqual(["First?", "Second?"]);
  });

  it("strips the numbering a copied list usually carries", () => {
    const text = "1. First?\n2) Second?\n- Third?\n• Fourth?\n* Fifth?";
    expect(parseQuestions(text).map((q) => q.text)).toEqual([
      "First?",
      "Second?",
      "Third?",
      "Fourth?",
      "Fifth?",
    ]);
  });

  it("leaves numbers that are part of the question alone", () => {
    // Only leading list markers go; "1984" is the question.
    expect(parseQuestions("1984 was written by whom?")[0]!.text).toBe(
      "1984 was written by whom?",
    );
  });

  it("gives every question a distinct id", () => {
    const ids = parseQuestions("a\nb\nc").map((q) => q.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("returns nothing for empty or whitespace-only input", () => {
    expect(parseQuestions("")).toEqual([]);
    expect(parseQuestions("   \n\n  ")).toEqual([]);
  });
});

// ── persistence ───────────────────────────────────────────────────────────

describe("question storage", () => {
  it("round-trips questions through storage", () => {
    const questions = parseQuestions("First?\nSecond?");
    saveQuestions(questions);
    expect(loadQuestions()).toEqual(questions);
  });

  it("returns an empty list when nothing is stored", () => {
    expect(loadQuestions()).toEqual([]);
  });

  it("falls back to empty rather than throwing on corrupt data", () => {
    localStorage.setItem("buzzroom-questions", "{not json");
    expect(loadQuestions()).toEqual([]);
  });

  it("falls back to empty when the stored value isn't a list", () => {
    localStorage.setItem("buzzroom-questions", '{"nope":1}');
    expect(loadQuestions()).toEqual([]);
  });
});

describe("history", () => {
  const entry = (winnerName: string) => ({
    at: Date.now(),
    question: "Q?",
    winnerName,
    points: 1,
  });

  it("keeps the newest entry first", () => {
    appendHistory(entry("Alice"));
    appendHistory(entry("Bob"));
    expect(loadHistory().map((e) => e.winnerName)).toEqual(["Bob", "Alice"]);
  });

  it("caps the log so a long session can't fill the quota", () => {
    for (let i = 0; i < 205; i++) appendHistory(entry(`P${i}`));
    expect(loadHistory()).toHaveLength(200);
    // The cap drops the oldest, not the newest.
    expect(loadHistory()[0]!.winnerName).toBe("P204");
  });

  it("clears", () => {
    appendHistory(entry("Alice"));
    clearHistory();
    expect(loadHistory()).toEqual([]);
  });
});

// ── storage that refuses to work ──────────────────────────────────────────

describe("when storage is unavailable", () => {
  it("reads as empty instead of throwing", () => {
    vi.stubGlobal(
      "localStorage",
      memoryStorage({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    );
    expect(loadQuestions()).toEqual([]);
    expect(loadHistory()).toEqual([]);
  });

  it("swallows a failed write rather than taking the screen down", () => {
    vi.stubGlobal(
      "localStorage",
      memoryStorage({
        setItem: () => {
          throw new Error("quota exceeded");
        },
      }),
    );
    expect(() => saveQuestions(parseQuestions("First?"))).not.toThrow();
    expect(() =>
      appendHistory({ at: 0, question: "Q", winnerName: "A", points: 1 }),
    ).not.toThrow();
  });
});
