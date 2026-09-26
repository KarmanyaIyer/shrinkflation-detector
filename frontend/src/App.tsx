import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router";
import { Shell } from "./components/Shell";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";

// The product drawer is its own chunk, so the article's first load does not carry it. It is
// fetched once the page has loaded and the browser is idle, so the first open does not wait.
const loadDrawer = () => import("./components/ProductDrawer");
const ProductDrawer = lazy(() => loadDrawer().then((module) => ({ default: module.ProductDrawer })));

function usePrefetchDrawer() {
  useEffect(() => {
    let timer = 0;
    let idle = 0;
    const start = () => {
      if (typeof window.requestIdleCallback === "function") {
        idle = window.requestIdleCallback(() => void loadDrawer(), { timeout: 3000 });
      } else {
        timer = window.setTimeout(() => void loadDrawer(), 1500);
      }
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      window.removeEventListener("load", start);
      window.clearTimeout(timer);
      if (idle) window.cancelIdleCallback(idle);
    };
  }, []);
}

// The product drawer is a child route of the article, so the article stays mounted and
// scrolled where it was while a product is open, and a direct load of /products/:id shows
// the article behind the drawer.
export function App() {
  usePrefetchDrawer();
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<HomePage />}>
          <Route
            path="products/:id"
            element={
              <Suspense fallback={null}>
                <ProductDrawer />
              </Suspense>
            }
          />
        </Route>
        <Route path="products" element={<Navigate to="/#search" replace />} />
        <Route path="ask" element={<Navigate to="/#ask" replace />} />
        <Route path="method" element={<Navigate to="/#how" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
