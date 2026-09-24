import { GITHUB_URL } from "./Shell";

export function Footnotes() {
  return (
    <>
      <section className="notes" aria-labelledby="n-h">
        <h2 id="n-h">Notes</h2>
        <ol>
          <li id="fn1">
            Sizes are read from the listing text in Kroger’s API. A size decrease means that text changed. Nobody weighed
            the package, so a corrected listing and a smaller package look the same here.{" "}
            <a className="back-ref" href="#r1" aria-label="Back to the text">
              Back
            </a>
          </li>
          <li id="fn2">
            All data comes from one store. Prices at other Kroger stores can differ.{" "}
            <a className="back-ref" href="#r2" aria-label="Back to the text">
              Back
            </a>
          </li>
          <li id="fn3">
            Dates are in the store’s time zone, Eastern time. “Sep 22 to 23” means the old size or price was last seen on
            Sep 22 and the new one was first seen on Sep 23.{" "}
            <a className="back-ref" href="#r3" aria-label="Back to the table">
              Back
            </a>
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
