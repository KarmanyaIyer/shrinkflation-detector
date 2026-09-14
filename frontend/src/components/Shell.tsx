import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router";

export const GITHUB_URL = "https://github.com/KarmanyaIyer/shrinkflation-detector";
export const SITE_URL = "https://karmanyaiyer.com/";

function Arrow() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M9 5H1.5M4.5 2 1.5 5l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BackLink({ className = "back" }: { className?: string }) {
  return (
    <a className={className} href={SITE_URL}>
      <Arrow /> KARMANYA IYER
    </a>
  );
}

const NAV = [
  { to: "/#changes", label: "Changes" },
  { to: "/#products", label: "Products" },
  { to: "/#how", label: "How it works" },
];

export function Shell() {
  const location = useLocation();

  // Page changes start at the top; hash changes are handled by the home page.
  useEffect(() => {
    if (!location.hash) window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);

  return (
    <>
      <header className="topbar">
        <BackLink />
        <nav className="nav" aria-label="Sections">
          {NAV.map((item) => (
            <Link key={item.to} to={item.to}>
              {item.label}
            </Link>
          ))}
          <a href={GITHUB_URL} rel="noopener">
            GitHub
          </a>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="foot wrap">
        <BackLink className="back-foot" />
        <a className="foot-link" href={GITHUB_URL} rel="noopener">
          Source on GitHub
        </a>
      </footer>
    </>
  );
}
