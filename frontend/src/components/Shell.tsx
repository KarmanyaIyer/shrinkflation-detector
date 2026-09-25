import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigationType } from "react-router";

import { ArticleDownContext } from "../lib/articleStatus";
import { isDrawerPath } from "../lib/drawerRoute";

export const GITHUB_URL = "https://github.com/KarmanyaIyer/shrinkflation-detector";
export const SITE_URL = "https://karmanyaiyer.com";

function BackArrow() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M7 3 2 8l5 5M2 8h12" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function Shell() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const previous = useRef(location.pathname);
  const [articleDown, setArticleDown] = useState(false);

  // A new page starts at the top. Opening or closing the product drawer keeps the article
  // where it was, Back and Forward keep the browser's restored position, and hash links are
  // handled by the home page.
  useEffect(() => {
    const from = previous.current;
    previous.current = location.pathname;
    if (navigationType === "POP" || location.hash) return;
    if (from === location.pathname) return;
    if (isDrawerPath(from) || isDrawerPath(location.pathname)) return;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname, location.hash, navigationType]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="mast">
        <div className="mast-in">
          <a className="back" href={SITE_URL}>
            <BackArrow />
            <span>Karmanya Iyer</span>
          </a>
          <Link
            className="mast-name"
            to="/"
            onClick={() => {
              // Already on the article: the route does not change, so go to the top here.
              if (location.pathname === "/") window.scrollTo({ top: 0, behavior: "instant" });
            }}
          >
            Shrinkflation Detector
          </Link>
          <nav className="mast-links" aria-label="Sections">
            {articleDown ? null : (
              <>
                <Link className="opt" to="/#ask">
                  Ask the data
                </Link>
                <Link className="opt" to="/#changes">
                  Every change
                </Link>
              </>
            )}
            <a href={GITHUB_URL} rel="noopener">
              GitHub
            </a>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <ArticleDownContext.Provider value={setArticleDown}>
          <Outlet />
        </ArticleDownContext.Provider>
      </main>
      <footer className="foot">
        <div className="foot-in">
          <a className="back" href={SITE_URL}>
            <BackArrow />
            <span>Karmanya Iyer</span>
          </a>
          <span className="foot-name">Shrinkflation Detector</span>
          <a className="foot-gh" href={GITHUB_URL} rel="noopener">
            Source on GitHub
          </a>
        </div>
      </footer>
    </>
  );
}
