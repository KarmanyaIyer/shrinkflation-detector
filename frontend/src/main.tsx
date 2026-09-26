import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import "./styles/fonts.css";
import "./styles/global.css";

// The basename keeps its trailing slash so links to the article read /projects/shrinkflation/
// and /projects/shrinkflation/#ask, the addresses the host serves without a redirect.
const basename = import.meta.env.BASE_URL;

// A deploy replaces the hashed chunk files, so a tab opened before it can fail to load the lazy
// drawer. Reload once to fetch the new page; a second failure in the same tab is left to throw.
window.addEventListener("vite:preloadError", (event) => {
  try {
    if (sessionStorage.getItem("chunk-reload")) return;
    sessionStorage.setItem("chunk-reload", "1");
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
