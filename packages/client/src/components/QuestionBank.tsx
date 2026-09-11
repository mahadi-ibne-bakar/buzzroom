import { useEffect, useState } from "react";
import {
  loadQuestions,
  parseQuestions,
  saveQuestions,
  type Question,
} from "../lib/questionBank.js";

interface Props {
  /** Pushes the host's current question out to the presenter screen. */
  onSelect: (text: string) => void;
  /** What the room currently shows, so the active row can be highlighted. */
  currentQuestion: string;
}

/**
 * The host's question list: paste a set in, step through them, and the
 * current one goes up on the presenter screen.
 *
 * Kept on the host's device (see lib/questionBank), so it survives between
 * sessions without the server needing anywhere to put it.
 */
export function QuestionBank({ onSelect, currentQuestion }: Props) {
  const [questions, setQuestions] = useState<Question[]>(loadQuestions);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    saveQuestions(questions);
  }, [questions]);

  const index = questions.findIndex((q) => q.text === currentQuestion);

  const add = () => {
    const parsed = parseQuestions(draft);
    if (parsed.length === 0) return;
    setQuestions((prev) => [...prev, ...parsed]);
    setDraft("");
    setAdding(false);
  };

  const remove = (id: string) =>
    setQuestions((prev) => prev.filter((q) => q.id !== id));

  const step = (delta: number) => {
    if (questions.length === 0) return;
    // From "nothing selected", Next starts at the top rather than the second
    // entry, which is what a host expects on the first tap of a fresh list.
    const next =
      index === -1 ? (delta > 0 ? 0 : questions.length - 1) : index + delta;
    const clamped = Math.min(Math.max(next, 0), questions.length - 1);
    onSelect(questions[clamped]!.text);
  };

  return (
    <div className="bg-slate-800 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-xs uppercase tracking-wider">
          Questions
        </span>
        <div className="flex items-center gap-2">
          {questions.length > 0 && (
            <>
              <span className="text-slate-500 text-xs tabular-nums">
                {index === -1 ? "—" : index + 1}/{questions.length}
              </span>
              <button
                onClick={() => step(-1)}
                disabled={index <= 0}
                className="px-2 py-1 rounded-lg bg-slate-700 text-white text-xs disabled:opacity-30"
              >
                ‹
              </button>
              <button
                onClick={() => step(1)}
                disabled={index === questions.length - 1}
                className="px-2 py-1 rounded-lg bg-slate-700 text-white text-xs disabled:opacity-30"
              >
                ›
              </button>
            </>
          )}
          <button
            onClick={() => setAdding((a) => !a)}
            className="text-accent-400 hover:text-accent-300 text-xs"
          >
            {adding ? "Cancel" : "+ Add"}
          </button>
        </div>
      </div>

      {adding && (
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={"Paste your questions, one per line"}
            rows={4}
            className="w-full bg-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-500"
          />
          <button
            onClick={add}
            disabled={parseQuestions(draft).length === 0}
            className="px-4 py-2 rounded-xl bg-accent-600 hover:bg-accent-500 disabled:opacity-40 text-white font-semibold text-sm"
          >
            Add {parseQuestions(draft).length || ""}
          </button>
        </div>
      )}

      {questions.length === 0 ? (
        <p className="text-slate-500 text-sm">
          No questions saved. They stay on this device.
        </p>
      ) : (
        <ol className="flex flex-col gap-1 max-h-56 overflow-y-auto">
          {questions.map((q, i) => (
            <li
              key={q.id}
              className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
                i === index
                  ? "bg-accent-900 text-white"
                  : "bg-slate-700/50 text-slate-300"
              }`}
            >
              <span className="text-slate-500 text-xs tabular-nums pt-0.5 w-5">
                {i + 1}
              </span>
              <button
                onClick={() => onSelect(q.text)}
                className="flex-1 text-left hover:text-white"
              >
                {q.text}
              </button>
              <button
                onClick={() => remove(q.id)}
                title="Remove"
                className="text-slate-500 hover:text-red-400 text-xs"
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}

      {currentQuestion && (
        <button
          onClick={() => onSelect("")}
          className="text-slate-500 hover:text-slate-300 text-xs self-start"
        >
          Clear from screen
        </button>
      )}
    </div>
  );
}
