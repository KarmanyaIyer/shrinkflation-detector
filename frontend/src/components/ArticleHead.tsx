import type { CSSProperties } from "react";
import type { Story } from "../lib/story";
import { noBreak } from "./NoBreak";
import { renderRuns } from "./Story";

const SKIP = [
  { href: "#ask", label: "Ask the data" },
  { href: "#changes", label: "Every change" },
  { href: "#search", label: "Find a product" },
  { href: "#how", label: "How this works" },
];

// Placeholder lines for text that has not loaded. Each line is exactly one line box of the
// element it sits in (1lh), so the skeleton has the height of that many lines of the final text
// and nothing moves when the text lands. The head text has a fixed measure in each width tier
// (global.css): w above 760 px, e 632 to 760, d 520 to 631, c 430 to 519, b 390 to 429, a below
// 390. Line counts per tier, measured on the current copy with stale, fresh and quiet data:
const TIERS = ["w", "e", "d", "c", "b", "a"] as const;
type Tier = (typeof TIERS)[number];
type Counts = Record<Tier, number>;

const HED: Counts = { w: 3, e: 2, d: 3, c: 3, b: 4, a: 4 };
const DEK: Counts = { w: 2, e: 2, d: 3, c: 3, b: 3, a: 4 };
const LEDE: Counts = { w: 4, e: 3, d: 4, c: 5, b: 5, a: 6 };
const WHEN: Counts = { w: 1, e: 1, d: 1, c: 1, b: 1, a: 1 };

const FULL = ["97%", "93%", "99%", "95%", "98%"];

// One set of lines per distinct count; each line carries x-<tier> for every tier that shows a
// different set, and the CSS hides it there.
function SkText({ counts, last }: { counts: Counts; last: string }) {
  const sets = [...new Set(TIERS.map((tier) => counts[tier]))];
  return (
    <>
      {sets.flatMap((n) => {
        const hidden = TIERS.filter((tier) => counts[tier] !== n)
          .map((tier) => ` x-${tier}`)
          .join("");
        return Array.from({ length: n }, (_, i) => {
          const width = i === n - 1 ? last : FULL[i % FULL.length];
          return <span key={`${n}-${i}`} className={`skl${hidden}`} style={{ "--w": width } as CSSProperties} />;
        });
      })}
    </>
  );
}

export function ArticleHead({ story }: { story: Story | null }) {
  return (
    <header className="head" id="top">
      <p className="kicker">{story?.kicker ?? "Grocery prices"}</p>
      {story ? (
        <h1>{story.headline}</h1>
      ) : (
        <h1 aria-busy="true">
          <span className="sr-only">Loading the latest figures</span>
          <SkText counts={HED} last="64%" />
        </h1>
      )}
      {story ? (
        <p className="dek">{renderRuns(story.dek)}</p>
      ) : (
        <p className="dek" aria-hidden="true">
          <SkText counts={DEK} last="58%" />
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
          <span className="when">{noBreak(story.freshness)}</span>
        ) : (
          <span className="when sk-when" aria-hidden="true">
            <SkText counts={WHEN} last="62%" />
          </span>
        )}
      </p>
      {story ? (
        <p className="lede">{renderRuns(story.lede)}</p>
      ) : (
        <p className="lede" aria-hidden="true">
          <SkText counts={LEDE} last="42%" />
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
