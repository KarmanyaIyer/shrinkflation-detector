import { useSearchParams } from "react-router";
import { getCategories } from "../api/client";
import { TrackedProducts } from "../components/TrackedProducts";
import { pluralize } from "../lib/format";
import { useApi, usePageTitle } from "../lib/useApi";

export function ProductsPage() {
  const [params] = useSearchParams();
  const category = params.get("category") ?? "";
  usePageTitle(category || "Products");
  const categories = useApi((signal) => getCategories(signal), []);
  const match = categories.data?.find((c) => c.category === category);

  return (
    <>
      <h1>{category || "Products"}</h1>
      {category ? (
        <p className="product-meta">
          {match
            ? `${pluralize(match.products, "tracked product")} · ${pluralize(match.changes, "change")} recorded`
            : " "}
        </p>
      ) : (
        <p className="note page-note">Search by name or brand, or open a category.</p>
      )}
      <TrackedProducts categories={categories} category={category || undefined} />
    </>
  );
}
