import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import type { Stats } from "../api/types";
import { formatDate, pluralize } from "../lib/format";
import type { AsyncState } from "../lib/useApi";

export const GITHUB_URL = "https://github.com/KarmanyaIyer/shrinkflation-detector";

export interface OutletContext {
  stats: AsyncState<Stats>;
}

export function lastRefreshText(stats: Stats): string {
  const run = stats.last_run;
  if (run && run.kind === "refresh" && run.finished_at) {
    return formatDate(run.finished_at) ?? "not yet";
  }
  return "not yet";
}

function Intro({ stats }: { stats: AsyncState<Stats> }) {
  const location = stats.data?.location_label;
  const description = location
    ? `Package sizes and prices for tracked grocery products at ${location}, checked daily.`
    : "Package sizes and prices for tracked grocery products, checked daily.";
  let line = " ";
  if (stats.status === "ok") {
    const s = stats.data;
    line = [
      pluralize(s.products_tracked, "product"),
      pluralize(s.categories, "category", "categories"),
      `tracking since ${formatDate(s.tracking_since) ?? "not yet"}`,
      `last refresh ${lastRefreshText(s)}`,
    ].join(" · ");
  } else if (stats.status === "error") {
    line = "Stats unavailable.";
  }
  return (
    <div className="site-intro">
      <p>{description}</p>
      <div className="site-stats">{line}</div>
    </div>
  );
}

export function Layout({ stats }: { stats: AsyncState<Stats> }) {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="site">
      <header className="site-header">
        <div className="wrap">
          <div className="site-bar">
            <Link to="/" className="site-title">
              Shrinkflation Detector
            </Link>
            <nav className="site-nav" aria-label="Site">
              <NavLink to="/" end>
                Feed
              </NavLink>
              <NavLink to="/products">Products</NavLink>
              <NavLink to="/ask">Ask</NavLink>
              <NavLink to="/method">Method</NavLink>
            </nav>
          </div>
          <Intro stats={stats} />
        </div>
      </header>
      <main className="site-main">
        <div className="wrap">
          <Outlet context={{ stats } satisfies OutletContext} />
        </div>
      </main>
      <footer className="site-footer">
        <div className="wrap">
          <span>Source: Kroger Public API. Independent project, not affiliated with Kroger.</span>
          <a href={GITHUB_URL} rel="noopener">
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
