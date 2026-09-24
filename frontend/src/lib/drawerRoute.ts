import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";

export interface DrawerState {
  fromArticle?: boolean;
}

// The element that opened the drawer, so focus can go back to it on close. Stored outside
// React because the opener is unmounted from nothing and the drawer mounts through the router.
let opener: Element | null = null;

export function rememberOpener(element: Element | null): void {
  opener = element;
}

export function takeOpener(): Element | null {
  const element = opener;
  opener = null;
  return element;
}

export function productPath(id: string): string {
  return `/products/${encodeURIComponent(id)}`;
}

export function isDrawerPath(pathname: string): boolean {
  return /^\/products\/[^/]+\/?$/.test(pathname);
}

// Opens a product's drawer over the article. The state marks the entry as one the app pushed,
// so closing can go back instead of pushing a second history entry. A fragment on the article's
// entry (/#changes) is dropped first: going back to an entry with a fragment makes the browser
// blur whatever was focused, which would defeat the focus return on close.
export function useOpenProduct(): (id: string, trigger?: Element | null) => void {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(
    (id: string, trigger?: Element | null) => {
      rememberOpener(trigger ?? document.activeElement);
      const state: DrawerState = { fromArticle: true };
      const alreadyOpen = isDrawerPath(location.pathname);
      if (!alreadyOpen && location.hash) {
        void navigate({ pathname: location.pathname, search: location.search }, { replace: true });
      }
      void navigate(productPath(id), { state, replace: alreadyOpen });
    },
    [navigate, location.pathname, location.search, location.hash],
  );
}
