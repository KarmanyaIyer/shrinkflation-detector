// Loading, error, and empty states. Loading states keep the shape of what they stand in for.

export function SkeletonLines({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  const widths = [92, 76, 58, 84, 66];
  return (
    <div className={`sk ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="sk-line" style={{ width: `${widths[i % widths.length]}%` }} />
      ))}
    </div>
  );
}

export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="sk sk-rows" aria-hidden="true">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="sk-row" style={{ gridTemplateColumns: `minmax(0, 2fr) repeat(${cols - 1}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }, (_, c) => (
            <span key={c} className="sk-line" style={{ width: c === 0 ? "70%" : "60%" }} />
          ))}
        </div>
      ))}
    </div>
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

export function Empty({ title, note }: { title: string; note?: string }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {note ? <p className="empty-note">{note}</p> : null}
    </div>
  );
}
