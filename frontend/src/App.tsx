import { Route, Routes } from "react-router";
import { getStats } from "./api/client";
import { Layout } from "./components/Layout";
import { useApi } from "./lib/useApi";
import { AskPage } from "./pages/AskPage";
import { FeedPage } from "./pages/FeedPage";
import { MethodPage } from "./pages/MethodPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ProductPage } from "./pages/ProductPage";
import { ProductsPage } from "./pages/ProductsPage";

export function App() {
  const stats = useApi((signal) => getStats(signal), []);
  return (
    <Routes>
      <Route element={<Layout stats={stats} />}>
        <Route index element={<FeedPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/:id" element={<ProductPage />} />
        <Route path="ask" element={<AskPage />} />
        <Route path="method" element={<MethodPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
