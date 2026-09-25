import type { ReactNode } from "react";
import { Link } from "react-router";
import { productPath, useOpenProduct, type DrawerState } from "../lib/drawerRoute";

const STATE: DrawerState = { fromArticle: true };

// A product name as a real link to its record. A plain click opens the drawer over the article;
// a modified click, a middle click, or a copied link work like any other link.
export function ProductLink({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const openProduct = useOpenProduct();
  return (
    <Link
      className={className}
      to={productPath(id)}
      state={STATE}
      onClick={(event) => {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        openProduct(id, event.currentTarget);
      }}
    >
      {children}
    </Link>
  );
}
