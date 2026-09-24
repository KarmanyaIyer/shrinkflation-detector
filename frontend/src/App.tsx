import { Navigate, Route, Routes } from "react-router";
import { ProductDrawer } from "./components/ProductDrawer";
import { Shell } from "./components/Shell";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";

// The product drawer is a child route of the article, so the article stays mounted and
// scrolled where it was while a product is open, and a direct load of /products/:id shows
// the article behind the drawer.
export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<HomePage />}>
          <Route path="products/:id" element={<ProductDrawer />} />
        </Route>
        <Route path="products" element={<Navigate to="/#search" replace />} />
        <Route path="ask" element={<Navigate to="/#ask" replace />} />
        <Route path="method" element={<Navigate to="/#how" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
