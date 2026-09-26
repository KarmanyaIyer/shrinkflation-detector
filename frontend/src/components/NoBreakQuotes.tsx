import type { ReactNode } from "react";

const QUOTED = /(“[^”]*”)/;

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
