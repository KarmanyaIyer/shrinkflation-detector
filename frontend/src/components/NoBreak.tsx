import type { ReactNode } from "react";

// Pieces of text that read wrong when split across lines: a quoted listed size such as
// “2 ct / 8 oz each”, a clock time such as "7:07 a.m.", and a number range such as "9-11" (the
// site fonts have no non-breaking hyphen, and a joiner character would end up in copied text).
const WHOLE = /(“[^”]*”|\b\d{1,2}:\d{2} [ap]\.m\.|\d+(?:\.\d+)?-\d+(?:\.\d+)?)/;

// Keeps each of those pieces on one line with a nowrap span; the text itself is unchanged.
export function noBreak(text: string): ReactNode {
  const parts = text.split(WHOLE);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="nw">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function NoBreak({ text }: { text: string }) {
  return <>{noBreak(text)}</>;
}
