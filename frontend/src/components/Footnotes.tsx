import { NoBreak } from "./NoBreak";
import { GITHUB_URL } from "./Shell";

// Which note markers exist on the page, in reading order: 1 sits in the lede, 2 in the size
// step, 3 in the table header. A back link is only rendered when its marker is there to go
// back to.
export interface NoteRefs {
  1: boolean;
  2: boolean;
  3: boolean;
}

export const NO_REFS: NoteRefs = { 1: false, 2: false, 3: false };

export const SIZE_NOTE_FALLBACK = "No package was measured. Every size comes from Kroger’s product API.";

function BackRef({ to, label, refs }: { to: 1 | 2 | 3; label: string; refs: NoteRefs }) {
  if (!refs[to]) return null;
  return (
    <>
      {" "}
      <a className="back-ref" href={`#r${to}`} aria-label={label}>
        Back
      </a>
    </>
  );
}

export function Footnotes({ refs, sizeNote }: { refs: NoteRefs; sizeNote?: string }) {
  return (
    <>
      <section className="notes" aria-labelledby="n-h">
        <h2 id="n-h">Notes</h2>
        <ol>
          <li id="fn1">
            Prices and listings at other Kroger stores can differ.
            <BackRef to={1} label="Back to the text" refs={refs} />
          </li>
          <li id="fn2">
            <NoBreak text={sizeNote ?? SIZE_NOTE_FALLBACK} />
            <BackRef to={2} label="Back to the text" refs={refs} />
          </li>
          <li id="fn3">
            Dates are in the store’s time zone, Eastern time. <span className="nw">“Sep 22 to 23”</span> means the old size or
            price was last seen on Sep 22 and the new one was first seen on Sep 23.
            <BackRef to={3} label="Back to the table" refs={refs} />
          </li>
        </ol>
      </section>
      <p className="bio">
        Karmanya Iyer is an AI engineer with a finance degree. The code for this project is{" "}
        <a href={GITHUB_URL} rel="noopener">
          on GitHub
        </a>
        .
      </p>
    </>
  );
}
