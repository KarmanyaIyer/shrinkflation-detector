import { useState, type FormEvent, type KeyboardEvent } from "react";
import { ask, getAskBudget } from "../api/client";
import { ApiError } from "../api/http";
import type { AskResponse } from "../api/types";
import { formatInt } from "../lib/format";
import { useApi, usePageTitle } from "../lib/useApi";

export const EXAMPLE_QUESTIONS = [
  "How many products are tracked?",
  "Did Honey Nut Cheerios change size?",
  "Which snacks shrank recently?",
];

const MAX_CHARS = 400;

export function describeAskError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.detail) return error.detail;
    switch (error.status) {
      case 0:
        return "Could not reach the API.";
      case 429:
        return "Too many requests. Wait a minute and try again.";
      case 503:
        return "The daily model budget is used up.";
      case 502:
        return "The assistant could not answer right now.";
      default:
        return `The question could not be sent (status ${error.status}).`;
    }
  }
  return "The question could not be sent.";
}

function Answer({ result }: { result: AskResponse }) {
  return (
    <section className="answer" aria-live="polite">
      <p className="answer-text">{result.answer}</p>
      <div className="tools">
        <span className="label">Tools used</span>
        {result.tool_calls.length > 0 ? (
          <ul>
            {result.tool_calls.map((call, index) => (
              <li key={`${call.name}-${index}`}>
                <span>
                  <span className="tool-name">{call.name}</span> <code>{JSON.stringify(call.arguments)}</code>
                </span>
                <span className={call.ok ? "tool-time" : "tool-time tool-failed"}>
                  {call.ok ? `${formatInt(call.ms)} ms` : `failed · ${formatInt(call.ms)} ms`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="tools-none">none</p>
        )}
      </div>
      <p className="meta">
        model {result.model} · {formatInt(result.total_tokens)} tokens · {formatInt(result.latency_ms)} ms
        {result.trace_id ? ` · trace ${result.trace_id}` : ""}
      </p>
    </section>
  );
}

export function AskPage() {
  usePageTitle("Ask");
  const budget = useApi((signal) => getAskBudget(signal), []);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const perDay = budget.data?.questions_per_day ?? null;
  const left = remaining ?? budget.data?.questions_remaining ?? null;
  const trimmed = question.trim();
  const canAsk = trimmed.length >= 3 && !pending;

  async function submit() {
    if (!canAsk) return;
    setPending(true);
    setError(null);
    try {
      const response = await ask(trimmed);
      setResult(response);
      setRemaining(response.questions_remaining);
    } catch (err) {
      setError(describeAskError(err));
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <div className="ask">
      <h1>Ask about a product</h1>
      <p className="note page-note">
        A language model answers with read-only tools over the tracked data: product search, product
        history, recent changes, and tracking stats. Every call is traced.
      </p>
      <div className="ask-budget" aria-live="polite">
        {left !== null && perDay !== null ? `${left} of ${perDay} questions left today` : " "}
      </div>

      <form className="ask-form" onSubmit={onSubmit}>
        <label htmlFor="question" className="visually-hidden">
          Question
        </label>
        <textarea
          id="question"
          className="input"
          value={question}
          maxLength={MAX_CHARS}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a question"
          rows={3}
        />
        <div className="ask-row">
          <span className="counter">
            {question.length} / {MAX_CHARS}
          </span>
          <button type="submit" className="btn" disabled={!canAsk}>
            {pending ? "Asking" : "Ask"}
          </button>
        </div>
      </form>

      <div className="examples" aria-label="Example questions">
        {EXAMPLE_QUESTIONS.map((example) => (
          <button
            key={example}
            type="button"
            className="btn-text"
            onClick={() => setQuestion(example)}
            disabled={pending}
          >
            {example}
          </button>
        ))}
      </div>

      {pending ? (
        <p className="ask-pending" role="status">
          Waiting for the model
        </p>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {result && !pending ? <Answer result={result} /> : null}
    </div>
  );
}
