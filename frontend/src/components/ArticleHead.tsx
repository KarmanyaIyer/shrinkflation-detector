import type { CSSProperties } from "react";
import type { Story } from "../lib/story";
import { renderRuns } from "./Story";

const SKIP = [
  { href: "#ask", label: "Ask the data" },
  { href: "#changes", label: "Every change" },
  { href: "#search", label: "Find a product" },
  { href: "#how", label: "How this works" },
];

// Placeholder lines for text that has not loaded. Each line is exactly one line box of the
// element it sits in (1lh), so the skeleton has the height of that many lines of the final
// text and nothing moves when the text lands. Line counts differ by layout: "w" lines show only
// above the phone breakpoint, "n" lines only below it. Measured on the current copy: the
// headline takes 4 lines from 768 to 1440 px and 5 on a phone, the dek 2 and 4, the lede 5 and
// 7 (8 at 360 px).
type SkSpec = [width: string, only?: "w" | "n"];

function SkText({ lines }: { lines: SkSpec[] }) {
  return (
    <>
      {lines.map(([width, only], i) => (
        <span key={i} className={`skl${only ? ` ${only}` : ""}`} style={{ "--w": width } as CSSProperties} />
      ))}
    </>
  );
}

const HED: SkSpec[] = [["96%"], ["90%"], ["94%"], ["62%", "w"], ["92%", "n"], ["48%", "n"]];
const DEK: SkSpec[] = [["98%"], ["70%", "w"], ["96%", "n"], ["92%", "n"], ["44%", "n"]];
const WHEN: SkSpec[] = [["62%"]];
const LEDE: SkSpec[] = [["100%"], ["97%"], ["99%"], ["95%"], ["30%", "w"], ["98%", "n"], ["96%", "n"], ["45%", "n"]];

export function ArticleHead({ story }: { story: Story | null }) {
  return (
    <header className="head" id="top">
      <p className="kicker">{story?.kicker ?? "Grocery prices"}</p>
      {story ? (
        <h1>{story.headline}</h1>
      ) : (
        <h1 aria-busy="true">
          <span className="sr-only">Loading the latest figures</span>
          <SkText lines={HED} />
        </h1>
      )}
      {story ? (
        <p className="dek">{renderRuns(story.dek)}</p>
      ) : (
        <p className="dek" aria-hidden="true">
          <SkText lines={DEK} />
        </p>
      )}
      <p className="byline">
        <span>
          By <b>Karmanya Iyer</b>
        </span>
        <span className="sep" aria-hidden="true">
          ·
        </span>
        {story ? (
          <span className="when">{story.freshness}</span>
        ) : (
          <span className="when sk-when" aria-hidden="true">
            <SkText lines={WHEN} />
          </span>
        )}
      </p>
      {story ? (
        <p className="lede">{renderRuns(story.lede)}</p>
      ) : (
        <p className="lede" aria-hidden="true">
          <SkText lines={LEDE} />
        </p>
      )}
      <nav className="skip" aria-label="Jump to a tool">
        <span className="skip-l">Skip to</span>
        {SKIP.map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
