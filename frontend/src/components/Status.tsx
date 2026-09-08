import { useEffect, useState } from "react";

// Shown only after a short delay so fast responses do not flash a loading line.
export function Loading({ what }: { what: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const handle = window.setTimeout(() => setVisible(true), 250);
    return () => window.clearTimeout(handle);
  }, []);
  if (!visible) return null;
  return (
    <p className="status" role="status">
      Loading {what}
    </p>
  );
}

export function LoadError({ what, error, retry }: { what: string; error: Error; retry?: () => void }) {
  return (
    <p className="status status-error" role="alert">
      Could not load {what}. {error.message}
      {retry ? (
        <button type="button" className="btn-link" onClick={retry}>
          Retry
        </button>
      ) : null}
    </p>
  );
}
