import { Link } from "react-router";
import { usePageTitle } from "../lib/useApi";

export function NotFoundPage() {
  usePageTitle("Page not found");
  return (
    <div className="page wrap">
      <h1>Page not found.</h1>
      <p className="note">
        <Link to="/">Back to the start</Link>
      </p>
    </div>
  );
}
