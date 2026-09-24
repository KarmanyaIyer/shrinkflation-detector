import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ask } from "../api/client";
import { ApiError, isAbortError } from "../api/http";
import type { AskResponse, FieldProduct } from "../api/types";
import { formatDuration, formatInt } from "../lib/format";
import { useOpenProduct } from "../lib/drawerRoute";
import { linkNames } from "../lib/text";

export const ASK_TIMEOUT_MS = 60_000;
export const MAX_QUESTION = 300;

// Questions the fixed tool set can always answer from the records.
export const EXAMPLES = ["Did anything shrink?", "Which categories changed the most?", "What changed in the last week?"];

type AskState =
  | { status: "idle" }
  | { status: "pending"; question: string; startedAt: number }
  | { status: "answer"; question: string; response: AskResponse }
  | { status: "error"; question: string; message: string };

export function describeAskError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return "Could not reach the API. Check your connection and try again.";
    if (error.status === 429) return error.detail ?? "This connection has asked its 10 questions for today. Try again tomorrow.";
    if (error.status === 503) return error.detail ?? "The assistant is paused right now. Try again later.";
    if (error.status >= 500) return "The assistant could not answer right now. Try again in a moment.";
    if (error.detail) return error.detail;
  }
  return "The assistant could not answer right now. Try again in a moment.";
}

export function productIdsOf(response: AskResponse): string[] {
  const ids = new Set<string>();
  for (const call of response.tool_calls) for (const id of call.product_ids ?? []) ids.add(id);
  return [...ids];
}

interface Block {
  kind: "p" | "ul";
  lines: string[];
}

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

// Splits a model's answer into paragraphs and lists on blank lines and bullet markers.
export function blocksOf(answer: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of answer.replace(/\r/g, "").split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    if (lines.every((line) => BULLET.test(line))) {
      blocks.push({ kind: "ul", lines: lines.map((line) => line.replace(BULLET, "")) });
    } else if (lines.length > 1 && lines.slice(1).every((line) => BULLET.test(line))) {
      blocks.push({ kind: "p", lines: [lines[0]!] });
      blocks.push({ kind: "ul", lines: lines.slice(1).map((line) => line.replace(BULLET, "")) });
    } else {
      blocks.push({ kind: "p", lines: [lines.join(" ")] });
    }
  }
  return blocks;
}

function argumentText(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return "no arguments";
  return entries.map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`).join(", ");
}

function Elapsed({ startedAt }: { startedAt: number }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const tick = () => setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const handle = window.setInterval(tick, 1000);
    return () => window.clearInterval(handle);
  }, [startedAt]);
  return (
    <>
      {seconds < 20
        ? `Asking the assistant. ${seconds} ${seconds === 1 ? "second" : "seconds"} so far.`
        : `Still waiting after ${seconds} seconds. The request gives up at 60.`}
    </>
  );
}

export function AskSection({ products }: { products: FieldProduct[] | null }) {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<AskState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);
  const openProduct = useOpenProduct();

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function submit(text: string) {
    const trimmed = text.trim().slice(0, MAX_QUESTION);
    if (!trimmed || state.status === "pending") return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), ASK_TIMEOUT_MS);
    setState({ status: "pending", question: trimmed, startedAt: Date.now() });
    try {
      const response = await ask(trimmed, controller.signal);
      if (controller.signal.aborted) return;
      setState({ status: "answer", question: trimmed, response });
    } catch (error) {
      if (controllerRef.current !== controller) return;
      const message = isAbortError(error)
        ? "No answer after 60 seconds. Try again, or ask a narrower question."
        : describeAskError(error);
      setState({ status: "error", question: trimmed, message });
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(question);
  }

  const pending = state.status === "pending";

  return (
    <section className="tool" id="ask" aria-labelledby="ask-h">
      <h2 id="ask-h">Ask the data</h2>
      <p className="tool-intro">
        An assistant answers from the same records. It can call four read-only tools, and each answer lists the
        calls it made. Each visitor gets 10 questions a day.
      </p>
      <form className="ask-form" onSubmit={onSubmit} autoComplete="off">
        <label className="sr-only" htmlFor="q">
          Your question
        </label>
        <input
          id="q"
          name="q"
          type="text"
          maxLength={MAX_QUESTION}
          placeholder="Ask about a product, brand, or category"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button type="submit" disabled={pending || !question.trim()}>
          <span>{pending ? "Asking" : "Ask"}</span>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M9 3l5 5-5 5M14 8H2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      </form>
      <div className="ask-try">
        <span className="ask-try-l">Try</span>
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            className="ex"
            disabled={pending}
            onClick={() => {
              setQuestion(example);
              void submit(example);
            }}
          >
            {example}
          </button>
        ))}
      </div>
      <div className="ask-out" aria-live="polite">
        {state.status === "pending" ? (
          <div className="pend" role="status">
            <div className="pend-bar" aria-hidden="true">
              <i />
            </div>
            <p>
              <Elapsed startedAt={state.startedAt} />
            </p>
          </div>
        ) : null}
        {state.status === "error" ? (
          <div className="pend err-line" role="alert">
            <p>{state.message}</p>
          </div>
        ) : null}
        {state.status === "answer" ? (
          <Answer question={state.question} response={state.response} products={products} onOpen={openProduct} />
        ) : null}
      </div>
    </section>
  );
}

function Answer({
  question,
  response,
  products,
  onOpen,
}: {
  question: string;
  response: AskResponse;
  products: FieldProduct[] | null;
  onOpen: (id: string, trigger?: Element | null) => void;
}) {
  // Names are linked from the products the tools touched when the response says which; every
  // tracked product otherwise.
  const linkable = useMemo(() => {
    const all = (products ?? []).map((product) => ({ id: product.id, name: product.name }));
    const touched = new Set(productIdsOf(response));
    const subset = all.filter((product) => touched.has(product.id));
    return subset.length ? subset : all;
  }, [products, response]);

  const render = (text: string): ReactNode[] =>
    linkNames(text, linkable).map((run, i) =>
      run.productId ? (
        <button
          key={i}
          type="button"
          className="pl"
          onClick={(event) => onOpen(run.productId!, event.currentTarget)}
        >
          {run.text}
        </button>
      ) : (
        <span key={i}>{run.text}</span>
      ),
    );

  const blocks = blocksOf(response.answer);
  const failed = response.tool_calls.filter((call) => !call.ok).length;

  return (
    <div className="ans">
      <p className="ans-q">{question}</p>
      <div className="ans-body">
        {blocks.map((block, i) =>
          block.kind === "ul" ? (
            <ul key={i}>
              {block.lines.map((line, j) => (
                <li key={j}>{render(line)}</li>
              ))}
            </ul>
          ) : (
            <p key={i}>{render(block.lines[0]!)}</p>
          ),
        )}
      </div>
      <details className="how">
        <summary>How this answer was found</summary>
        {response.tool_calls.length === 0 ? (
          <p className="calls-none">The assistant answered without calling a tool.</p>
        ) : (
          <table className="calls">
            <caption className="sr-only">Tool calls made for this answer</caption>
            <thead>
              <tr>
                <th scope="col">Tool</th>
                <th scope="col">Arguments</th>
                <th scope="col" className="n">
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {response.tool_calls.map((call, i) => (
                <tr key={i}>
                  <td>
                    <code>{call.name}</code>
                    {call.ok ? null : <span className="pm">failed</span>}
                  </td>
                  <td>{argumentText(call.arguments)}</td>
                  <td className="n">{formatDuration(call.ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="ans-foot">
          Model {response.model}, {formatInt(response.total_tokens)} tokens, {formatDuration(response.latency_ms)} in total
          {failed ? `, ${failed} ${failed === 1 ? "call" : "calls"} failed` : ""}.
          {response.trace_id ? (
            <>
              {" "}
              Trace <code>{response.trace_id}</code>.
            </>
          ) : null}
        </p>
      </details>
    </div>
  );
}
