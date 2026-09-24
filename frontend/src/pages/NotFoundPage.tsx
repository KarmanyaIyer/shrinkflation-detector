import { Link } from "react-router";
import { usePageTitle } from "../lib/useApi";

export function NotFoundPage() {
  usePageTitle("Page not found");
  return (
    <article>
      <header className="head" id="top">
        <p className="kicker">Not found</p>
        <h1>There is no page at this address.</h1>
        <p className="dek">
          <Link to="/">Go to the article</Link>, or <Link to="/#search">find a product</Link>.
        </p>
      </header>
    </article>
  );
}
