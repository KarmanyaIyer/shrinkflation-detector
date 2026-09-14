import { useState } from "react";
import { Link } from "react-router";
import type { ProductSummary } from "../api/types";

export function ProductThumb({ src, large = false }: { src: string | null | undefined; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={large ? "thumb thumb-lg" : "thumb"} aria-hidden="true">
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : null}
    </span>
  );
}

export function productSubline(product: ProductSummary): string {
  return [product.brand, product.category].filter(Boolean).join(" · ");
}

// First cell of a product row: thumbnail, name linking to the product page, brand and category.
export function ProductCell({ product }: { product: ProductSummary }) {
  return (
    <td className="td-product" data-label="Product">
      <div className="product-cell">
        <ProductThumb src={product.image_url} />
        <div className="product-text">
          <Link to={`/products/${product.id}`} className="product-name">
            {product.description}
          </Link>
          <div className="product-sub">{productSubline(product)}</div>
        </div>
      </div>
    </td>
  );
}
