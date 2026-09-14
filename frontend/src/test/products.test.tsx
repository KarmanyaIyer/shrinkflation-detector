import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "../api/fixtures";
import { ProductsPage } from "../pages/ProductsPage";

vi.mock("../api/client", () => ({
  PAGE_SIZE: 30,
  getCatalog: vi.fn(),
}));

import { getCatalog } from "../api/client";

function renderProducts(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>home</p>} />
        <Route path="/products" element={<ProductsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(getCatalog).mockReset();
});

describe("ProductsPage", () => {
  it("lists a category with size, price, and per-unit columns", async () => {
    const snacks = fx.catalogItems.filter((item) => item.product.category === "Snacks");
    vi.mocked(getCatalog).mockResolvedValue({ items: snacks, total: snacks.length, limit: 30, offset: 0 });
    renderProducts("/products?category=Snacks");

    expect(await screen.findByRole("heading", { name: "Snacks" })).toBeInTheDocument();
    expect(vi.mocked(getCatalog).mock.calls[0]?.[0]).toMatchObject({ category: "Snacks", offset: 0 });
    expect(screen.getByText("3 products")).toBeInTheDocument();
    for (const name of ["Product", "Size", "Price", "Per unit"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
    const lays = screen.getByRole("link", { name: "Lay's Classic Potato Chips" }).closest("tr")!;
    expect(within(lays).getByText("7.75 oz")).toBeInTheDocument();
    expect(within(lays).getByText("$4.79")).toBeInTheDocument();
    expect(within(lays).getByText("$0.618/oz")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All categories" })).toHaveAttribute("href", "/#products");
    expect(screen.queryByRole("button", { name: /Show/ })).not.toBeInTheDocument();
  });

  it("loads the next page on request", async () => {
    const page = fx.catalogItems.slice(0, 2);
    vi.mocked(getCatalog)
      .mockResolvedValueOnce({ items: page, total: 5, limit: 30, offset: 0 })
      .mockResolvedValueOnce({ items: fx.catalogItems.slice(2, 5), total: 5, limit: 30, offset: 2 });
    renderProducts("/products?category=Pantry");
    const more = await screen.findByRole("button", { name: "Show 3 more" });
    fireEvent.click(more);
    expect(vi.mocked(getCatalog).mock.calls[1]?.[0]).toMatchObject({ category: "Pantry", offset: 2 });
    expect(await screen.findByText(fx.catalogItems[4]!.product.description)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show/ })).not.toBeInTheDocument();
  });

  it("goes home without a category", async () => {
    renderProducts("/products");
    expect(await screen.findByText("home")).toBeInTheDocument();
    expect(vi.mocked(getCatalog)).not.toHaveBeenCalled();
  });
});
