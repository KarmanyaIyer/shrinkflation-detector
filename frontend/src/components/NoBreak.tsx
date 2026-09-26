import type { ReactNode } from "react";

const QUOTED = /(“[^”]*”)/;
const CLOCK = /(\d{1,2}:\d{2} [ap]\.m\.)/;

// Keeps each quoted listed size, such as “2 ct / 8 oz each”, on one line.
export function noBreakQuotes(text: string): ReactNode {
  if (!text.includes("“")) return text;
  return text.split(QUOTED).map((part, i) =>
    part.startsWith("“") ? (
      <span key={i} className="nw">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function NoBreakQuotes({ text }: { text: string }) {
  return <>{noBreakQuotes(text)}</>;
}

// Keeps a clock time such as "7:07 a.m." on one line.
export function noBreakTimes(text: string): ReactNode {
  if (!CLOCK.test(text)) return text;
  return text.split(CLOCK).map((part, i) =>
    CLOCK.test(part) ? (
      <span key={i} className="nw">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
