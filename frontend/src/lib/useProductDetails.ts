import { useEffect, useState } from "react";
import { getProduct } from "../api/client";
import type { ProductDetail } from "../api/types";

const cache = new Map<string, Promise<ProductDetail>>();

export function loadProductDetail(id: string): Promise<ProductDetail> {
  let pending = cache.get(id);
  if (!pending) {
    pending = getProduct(id);
    pending.catch(() => cache.delete(id));
    cache.set(id, pending);
  }
  return pending;
}

// Load product details for a list of ids with limited concurrency. Results arrive one by one.
export function useProductDetails(ids: readonly string[]): {
  details: Record<string, ProductDetail>;
  failed: number;
} {
  const [details, setDetails] = useState<Record<string, ProductDetail>>({});
  const [failed, setFailed] = useState(0);
  const key = ids.join(",");

  useEffect(() => {
    let cancelled = false;
    const queue = key ? key.split(",") : [];
    setFailed(0);

    async function worker() {
      while (queue.length > 0 && !cancelled) {
        const id = queue.shift()!;
        try {
          const detail = await loadProductDetail(id);
          if (!cancelled) setDetails((prev) => (prev[id] ? prev : { ...prev, [id]: detail }));
        } catch {
          if (!cancelled) setFailed((count) => count + 1);
        }
      }
    }

    void Promise.all(Array.from({ length: Math.min(4, queue.length) }, () => worker()));
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { details, failed };
}
