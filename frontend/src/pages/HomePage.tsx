import { useEffect } from "react";
import { useLocation } from "react-router";
import { getCategories, getField, getStats } from "../api/client";
import { ChangesSection } from "../components/ChangesSection";
import { Hero } from "../components/Hero";
import { MethodSection } from "../components/MethodSection";
import { ProductsSection } from "../components/ProductsSection";
import { useApi, usePageTitle, useSlow } from "../lib/useApi";

export function HomePage() {
  usePageTitle(null);
  const location = useLocation();
  const stats = useApi((signal) => getStats(signal), []);
  const categories = useApi((signal) => getCategories(signal), []);
  const field = useApi((signal) => getField(signal), []);
  const slow = useSlow(stats.status === "loading", 3000);

  // Section links carry a hash; the sections exist from the first render, so the jump is
  // stable even while their data is still loading.
  useEffect(() => {
    if (!location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView({ block: "start" });
  }, [location.hash, location.key]);

  return (
    <>
      <Hero stats={stats} field={field.status === "ok" ? field.data.products : null} slow={slow} />
      <ChangesSection stats={stats} categories={categories} />
      <ProductsSection stats={stats} categories={categories} />
      <MethodSection stats={stats} />
      <p className="colophon wrap">
        <span>
          Built by Karmanya Iyer as an independent project. Not affiliated with Kroger. Names and sizes are shown as
          the API returns them; parsed quantities never overwrite the source text.
        </span>
      </p>
    </>
  );
}
