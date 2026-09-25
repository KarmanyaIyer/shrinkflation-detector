import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import "./styles/fonts.css";
import "./styles/global.css";

// The basename keeps its trailing slash so links to the article read /projects/shrinkflation/
// and /projects/shrinkflation/#ask, the addresses the host serves without a redirect.
const basename = import.meta.env.BASE_URL;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
