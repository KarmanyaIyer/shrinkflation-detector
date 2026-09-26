import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { productLocation, useOpenProduct } from "../lib/drawerRoute";

// A product name as a real link to its record. A plain click opens the drawer over the article;
// a modified click, a middle click, or a copied link work like any other link.
export function ProductLink({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const openProduct = useOpenProduct();
  const { search } = useLocation();
  return (
    <Link
      className={className}
      to={productLocation(id, search)}
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
