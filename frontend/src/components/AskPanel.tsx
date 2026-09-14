import { useEffect, useRef, useState, type FormEvent } from "react";
import { ask } from "../api/client";
import { ApiError, isAbortError } from "../api/http";
import type { AskResponse, ToolCallOut } from "../api/types";
import { formatDuration, formatInt } from "../lib/format";
import { SkeletonLines } from "./Status";

export const MAX_QUESTION = 400;

export const EXAMPLE_QUESTIONS = [
  "Did Honey Nut Cheerios shrink?",
  "Which snacks cost more per ounce now?",
  "What changed this week?",
];

type AskState =
  | { status: "idle" }
  | { status: "pending"; question: string }
  | { status: "ok"; question: string; response: AskResponse }
  | { status: "error"; question: string; message: string };

export function describeAskError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return error.detail ?? "You have used today's questions. The budget resets at midnight UTC.";
    }
    if (error.status === 503) return error.detail ?? "The assistant is paused for today. Try again tomorrow.";
    if (error.status === 422) return error.detail ?? "That question could not be sent.";
    if (error.status === 0) return "Could not reach the API. Check your connection and try again.";
    return error.detail ?? "The assistant could not answer right now. Try again in a moment.";
  }
  return "The assistant could not answer right now. Try again in a moment.";
}

function argumentText(call: ToolCallOut): string {
  return Object.entries(call.arguments)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(", ");
}

export function productIdsOf(response: AskResponse): string[] {
  return [...new Set(response.tool_calls.flatMap((call) => call.product_ids ?? []))];
}

export function AskPanel({
  onPending,
  onAnswer,
}: {
  onPending: (pending: boolean) => void;
  onAnswer: (productIds: string[]) => void;
}) {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<AskState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || state.status === "pending") return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "pending", question: trimmed });
    onPending(true);
    try {
      const response = await ask(trimmed, controller.signal);
      if (controller.signal.aborted) return;
      setState({ status: "ok", question: trimmed, response });
      onAnswer(productIdsOf(response));
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      setState({ status: "error", question: trimmed, message: describeAskError(error) });
    } finally {
      if (!controller.signal.aborted) onPending(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(question);
  }

  function useExample(text: string) {
    setQuestion(text);
    void submit(text);
  }

  const pending = state.status === "pending";

  return (
    <div className="ask">
      <form className="ask-row" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="ask-input">
          Ask about a product
        </label>
        <input
          id="ask-input"
          className="ask-input"
          type="text"
          value={question}
          maxLength={MAX_QUESTION}
          placeholder="Ask about a product, brand, or category"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button type="submit" className="btn btn-ink" disabled={pending || question.trim() === ""}>
          {pending ? "Asking" : "Ask"}
        </button>
      </form>
      <div className="chips" aria-label="Example questions">
        {EXAMPLE_QUESTIONS.map((text) => (
          <button key={text} type="button" className="chip" onClick={() => useExample(text)} disabled={pending}>
            {text}
          </button>
        ))}
      </div>

      {state.status === "pending" ? (
        <div className="answer" role="status" aria-label="Working on the answer">
          <SkeletonLines lines={3} className="answer-sk" />
        </div>
      ) : null}

      {state.status === "error" ? (
        <p className="ask-error" role="alert">
          {state.message}
        </p>
      ) : null}

      {state.status === "ok" ? <Answer response={state.response} /> : null}
    </div>
  );
}

function Answer({ response }: { response: AskResponse }) {
  return (
    <div className="answer">
      <p className="answer-text">{response.answer}</p>
      {response.tool_calls.length > 0 ? (
        <ol className="trace" aria-label="Tool calls">
          {response.tool_calls.map((call, index) => (
            <li key={index} className={call.ok ? "trace-row" : "trace-row failed"}>
              <span className="trace-name">{call.name}</span>
              <span className="trace-args">{argumentText(call)}</span>
              <span className="trace-ms">{call.ok ? formatDuration(call.ms) : "failed"}</span>
            </li>
          ))}
        </ol>
      ) : null}
      <p className="answer-meta">
        <span>
          {response.model}, {formatInt(response.total_tokens)} tokens, {formatDuration(response.latency_ms)}
        </span>
        {response.trace_id ? <span className="trace-id">trace {response.trace_id.slice(0, 12)}</span> : null}
      </p>
    </div>
  );
}
