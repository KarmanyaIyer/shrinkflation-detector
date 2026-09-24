import type { Story } from "../lib/story";
import { SkLine } from "./Status";
import { renderRuns } from "./Story";

const SKIP = [
  { href: "#ask", label: "Ask the data" },
  { href: "#changes", label: "Every change" },
  { href: "#search", label: "Find a product" },
  { href: "#how", label: "How this works" },
];

export function ArticleHead({ story }: { story: Story | null }) {
  return (
    <header className="head" id="top">
      <p className="kicker">{story?.kicker ?? "Grocery prices"}</p>
      {story ? (
        <h1>{story.headline}</h1>
      ) : (
        <h1 aria-busy="true">
          <span className="sr-only">Loading the latest figures</span>
          <SkLine width="92%" height={44} />
          <SkLine width="74%" height={44} />
        </h1>
      )}
      {story ? (
        <p className="dek">{story.dek}</p>
      ) : (
        <p className="dek" aria-hidden="true">
          <SkLine width="96%" height={20} />
          <SkLine width="58%" height={20} />
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
          <span className="when" aria-hidden="true">
            <SkLine width={260} height={12} />
          </span>
        )}
      </p>
      {story ? (
        <p className="lede">{renderRuns(story.lede)}</p>
      ) : (
        <p className="lede" aria-hidden="true">
          <SkLine width="100%" height={16} />
          <SkLine width="100%" height={16} />
          <SkLine width="100%" height={16} />
          <SkLine width="46%" height={16} />
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
