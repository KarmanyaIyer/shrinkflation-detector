import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "../api/fixtures";
import type { CatalogItem, CatalogList } from "../api/types";
import { ProductsPage } from "../pages/ProductsPage";

vi.mock("../api/client", () => ({
  PAGE_SIZE: 30,
  getCategories: vi.fn(),
  getCatalog: vi.fn(),
}));

import { getCatalog, getCategories } from "../api/client";

const snacks = fx.catalogItems.filter((item) => item.product.category === "Snacks");

function page(items: CatalogItem[], overrides: Partial<CatalogList> = {}): CatalogList {
  return { items, total: items.length, limit: 30, offset: 0, ...overrides };
}

function renderProducts(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/products${search}`]}>
      <ProductsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(getCategories).mockReset();
  vi.mocked(getCatalog).mockReset();
  vi.mocked(getCategories).mockResolvedValue(fx.categories);
});

describe("ProductsPage without a category", () => {
  it("lists categories and does not query the catalog", async () => {
    renderProducts();
    expect(screen.getByRole("heading", { name: "Products" })).toBeInTheDocument();
    expect(await screen.findByRole("columnheader", { name: "Category" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Snacks" })).toBeInTheDocument();
    expect(vi.mocked(getCatalog)).not.toHaveBeenCalled();
  });
});

describe("ProductsPage for a category", () => {
  it("lists the category's products with their current state", async () => {
    vi.mocked(getCatalog).mockResolvedValue(page(snacks));
    renderProducts("?category=Snacks");

    expect(screen.getByRole("heading", { name: "Snacks" })).toBeInTheDocument();
    expect(await screen.findByText("120 tracked products · 2 changes recorded")).toBeInTheDocument();
    for (const name of ["Product", "Current size", "Regular price", "Unit price", "Changes", "Tracked since"]) {
      expect(await screen.findByRole("columnheader", { name })).toBeInTheDocument();
    }
    expect(vi.mocked(getCatalog).mock.calls[0]?.[0]).toMatchObject({
      category: "Snacks",
      limit: 30,
      offset: 0,
    });

    const lays = screen.getByRole("link", { name: "Lay's Classic Potato Chips" }).closest("tr")!;
    expect(lays).toBeInTheDocument();
    const cells = within(lays);
    expect(cells.getByText("7.75 oz")).toBeInTheDocument();
    expect(cells.getByText("$4.79")).toBeInTheDocument();
    expect(cells.getByText("$0.618/oz")).toBeInTheDocument();
    expect(cells.getByText("1")).toBeInTheDocument();
    expect(cells.getByText("Jul 6, 2026")).toBeInTheDocument();

    // Zero recorded changes renders as an empty cell, not a zero.
    const oreo = screen.getByRole("link", { name: "Oreo Chocolate Sandwich Cookies" }).closest("tr")!;
    expect(within(oreo).queryByText("0")).not.toBeInTheDocument();
  });

  it("pages with Show more", async () => {
    vi.mocked(getCatalog)
      .mockResolvedValueOnce(page(snacks, { total: 5 }))
      .mockResolvedValueOnce(page(fx.catalogItems.slice(2, 4), { total: 5, offset: 3 }));
    renderProducts("?category=Snacks");

    expect(await screen.findByText("3 of 5 shown")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(
      await screen.findByRole("link", { name: "General Mills Honey Nut Cheerios™ Cereal" }),
    ).toBeInTheDocument();
    expect(vi.mocked(getCatalog).mock.calls[1]?.[0]).toMatchObject({ category: "Snacks", offset: 3 });
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("searches within the category", async () => {
    vi.mocked(getCatalog).mockImplementation((params) =>
      Promise.resolve(
        params.q
          ? page(snacks.filter((item) => item.product.description.includes("Chips")))
          : page(snacks),
      ),
    );
    renderProducts("?category=Snacks");
    await screen.findByRole("link", { name: "Oreo Chocolate Sandwich Cookies" });

    fireEvent.change(screen.getByRole("searchbox", { name: "Search tracked products" }), {
      target: { value: "chips" },
    });
    expect(await screen.findByText('2 products match "chips" in Snacks')).toBeInTheDocument();
    expect(vi.mocked(getCatalog).mock.calls.at(-1)?.[0]).toMatchObject({ q: "chips", category: "Snacks" });
    expect(screen.queryByRole("link", { name: "Oreo Chocolate Sandwich Cookies" })).not.toBeInTheDocument();
  });
});
