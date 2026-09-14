import type { CatalogItem } from "../api/types";
import { formatMoney, formatUnitPrice } from "../lib/format";
import { LinkRow } from "./LinkRow";
import { ProductCell } from "./ProductCell";

export function CatalogTable({ items }: { items: CatalogItem[] }) {
  return (
    <table className="tbl tbl-catalog">
      <colgroup>
        <col className="col-product" />
        <col className="col-size" />
        <col className="col-price" />
        <col className="col-unit" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Product</th>
          <th scope="col">Size</th>
          <th scope="col">Price</th>
          <th scope="col">Per unit</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <LinkRow key={item.product.id} to={`/products/${item.product.id}`}>
            <ProductCell product={item.product} />
            <td className="mono-line" data-label="Size">
              {item.current?.size_text ?? <span className="same">not seen</span>}
            </td>
            <td className="mono-line" data-label="Price">
              {formatMoney(item.current?.price_regular) ?? <span className="same">no price</span>}
            </td>
            <td className="mono-line" data-label="Per unit">
              {formatUnitPrice(item.current?.unit_price?.value, item.current?.unit_price?.unit) ?? (
                <span className="same">size not parsed</span>
              )}
            </td>
          </LinkRow>
        ))}
      </tbody>
    </table>
  );
}
