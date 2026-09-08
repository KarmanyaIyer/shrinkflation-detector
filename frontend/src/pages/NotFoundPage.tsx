import { Link } from "react-router";
import { usePageTitle } from "../lib/useApi";

export function NotFoundPage() {
  usePageTitle("Page not found");
  return (
    <>
      <h1>Page not found.</h1>
      <p className="note page-note">
        <Link to="/">Back to the feed</Link>
      </p>
    </>
  );
}
