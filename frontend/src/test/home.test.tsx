import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "../api/fixtures";
import type { ChangeList, FeedKind } from "../api/types";
import { MINUS } from "../lib/format";
import { FEED_KIND_MEMBERS } from "../lib/kinds";
import { HomePage } from "../pages/HomePage";

vi.mock("../api/client", () => ({
  PAGE_SIZE: 30,
  getStats: vi.fn(),
  getCategories: vi.fn(),
  getField: vi.fn(),
  getChanges: vi.fn(),
  getCatalog: vi.fn(),
  ask: vi.fn(),
}));

// The canvas map needs a real 2d context, which jsdom does not have.
vi.mock("../components/Field", () => ({
  Field: ({ products }: { products: unknown[] | null }) => (
    <div data-testid="field">{products ? `${products.length} squares` : "loading"}</div>
  ),
}));

import { getCatalog, getCategories, getChanges, getField, getStats } from "../api/client";

function renderHome(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// The count in the changes section, as opposed to the same words on a category card.
async function findChangeCount(text: string) {
  const section = await screen.findByRole("region", { name: "What changed" });
  return within(section).findByText(text);
}

// Answers like the API: only the changes of the requested kind.
function changesFor(kind: FeedKind): ChangeList {
  const members = FEED_KIND_MEMBERS[kind];
  const items = fx.changes.filter((change) => members.includes(change.kind));
  return { items, total: items.length, limit: 30, offset: 0 };
}

beforeEach(() => {
  vi.mocked(getStats).mockReset().mockResolvedValue(fx.stats);
  vi.mocked(getCategories).mockReset().mockResolvedValue(fx.categories);
  vi.mocked(getField).mockReset().mockResolvedValue(fx.field);
  vi.mocked(getChanges)
    .mockReset()
    .mockImplementation((params) => Promise.resolve(changesFor(params.kind)));
  vi.mocked(getCatalog).mockReset();
});

describe("HomePage with published changes", () => {
  it("states the store and count in one line and draws the map", async () => {
    renderHome();
    expect(
      await screen.findByText(
        "Sizes and prices of 1,242 products at one Cincinnati-area Kroger, checked every morning since Jul 6.",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("field")).toHaveTextContent("1242 squares");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Same price, smaller box.");
  });

  it("opens on size decreases with four fixed columns and plain before/after lines", async () => {
    renderHome();
    expect(await findChangeCount("2 changes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Shrank/, pressed: true })).toBeInTheDocument();
    expect(vi.mocked(getChanges).mock.calls[0]?.[0]).toMatchObject({ kind: "shrink", offset: 0 });

    for (const name of ["Product", "Change", "Per unit", "When"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
    const rows = screen.getAllByRole("row").filter((row) => row.classList.contains("link-row"));
    expect(rows).toHaveLength(2);

    const cheerios = rows.find(
      (row) =>
        within(row).queryByText("General Mills Honey Nut Cheerios™ Cereal") !== null &&
        within(row).queryByText(`${MINUS}10.0%`) !== null,
    )!;
    expect(cheerios).toBeDefined();
    const cells = within(cheerios);
    expect(cells.getByText("Cheerios · Cereal and breakfast")).toBeInTheDocument();
    expect(cells.getByText(`${MINUS}10.0%`)).toHaveClass("delta", "worse");
    expect(cells.getByText("12 oz → 10.8 oz")).toBeInTheDocument();
    expect(cells.getByText("$4.29").parentElement).toHaveTextContent("$4.29 unchanged");
    expect(cells.getByText("$0.358 → $0.397/oz")).toBeInTheDocument();
    expect(cells.getByText("+11.1%")).toHaveClass("worse");
    expect(cells.getByText("Aug 13 → 14")).toHaveAttribute(
      "title",
      "12 oz at $4.29 was last seen Aug 13, 2026. 10.8 oz at $4.29 was first seen Aug 14, 2026.",
    );
    expect(cells.queryByText("Shrank")).not.toBeInTheDocument();
    expect(cells.getByRole("link", { name: "General Mills Honey Nut Cheerios™ Cereal" })).toHaveAttribute(
      "href",
      "/products/0001600012479",
    );
  });

  it("names the kind only on the All tab and colors cheaper per unit as better", async () => {
    renderHome();
    await findChangeCount("2 changes");
    fireEvent.click(screen.getByRole("button", { name: /All/ }));
    expect(await screen.findByRole("button", { name: /All/, pressed: true })).toBeInTheDocument();
    expect(vi.mocked(getChanges).mock.calls.at(-1)?.[0]).toMatchObject({ kind: "all" });
    expect(await findChangeCount("8 changes")).toBeInTheDocument();
    const rows = screen.getAllByRole("row").filter((row) => row.classList.contains("link-row"));
    expect(rows).toHaveLength(fx.changes.length);
    expect(screen.getAllByText("Price up").length).toBeGreaterThan(0);
    expect(screen.getByText("Shrank, cheaper per unit")).toHaveClass("kind", "better");
    for (const cheaper of screen.getAllByText(`${MINUS}14.3%`)) expect(cheaper).toHaveClass("better");
    expect(screen.getByText("size not parsed")).toBeInTheDocument();
    expect(screen.getByText("Aug 20 → 24")).toBeInTheDocument();
  });

  it("honors a kind in the URL and filters by category", async () => {
    renderHome("/?kind=price_increase");
    expect(await screen.findByRole("button", { name: /Price up/, pressed: true })).toBeInTheDocument();
    expect(vi.mocked(getChanges).mock.calls[0]?.[0]).toMatchObject({ kind: "price_increase" });
    expect(await findChangeCount("3 changes")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), { target: { value: "Snacks" } });
    expect(vi.mocked(getChanges).mock.calls.at(-1)?.[0]).toMatchObject({ kind: "price_increase", category: "Snacks" });
  });

  it("still loads changes when the stats request fails", async () => {
    vi.mocked(getStats).mockRejectedValue(new Error("stats down"));
    renderHome();
    expect(
      await screen.findByText(
        "Sizes and prices of every tracked product at one Cincinnati-area Kroger, checked every morning.",
      ),
    ).toBeInTheDocument();
    expect(await findChangeCount("2 changes")).toBeInTheDocument();
    expect(vi.mocked(getChanges).mock.calls[0]?.[0]).toMatchObject({ kind: "shrink" });
  });

  it("lists categories as links and searches the catalog", async () => {
    vi.mocked(getCatalog).mockResolvedValue({
      items: fx.catalogItems.filter((item) => item.product.description.includes("Cheerios")),
      total: 2,
      limit: 30,
      offset: 0,
    });
    renderHome();
    expect(await screen.findByRole("heading", { name: "1,242 products in 13 categories" })).toBeInTheDocument();
    const snacks = screen.getByRole("link", { name: /Snacks/ });
    expect(snacks).toHaveAttribute("href", "/products?category=Snacks");
    expect(within(snacks).getByText("120")).toBeInTheDocument();
    expect(within(snacks).getByText("2 changes")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search products" }), { target: { value: "cheerios" } });
    expect(await screen.findByText("18.8 oz")).toBeInTheDocument();
    expect(vi.mocked(getCatalog).mock.calls.at(-1)?.[0]).toMatchObject({ q: "cheerios" });
    expect(screen.getByRole("columnheader", { name: "Size" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Snacks/ })).not.toBeInTheDocument();
  });
});

describe("HomePage on day one", () => {
  beforeEach(() => {
    vi.mocked(getStats).mockResolvedValue(fx.dayOneStats);
    vi.mocked(getChanges).mockResolvedValue(fx.emptyChangeList);
  });

  it("opens on All instead of an empty shrink tab and states the empty table as a fact", async () => {
    renderHome();
    expect(await screen.findByRole("button", { name: /All/, pressed: true })).toBeInTheDocument();
    expect(vi.mocked(getChanges).mock.calls[0]?.[0]).toMatchObject({ kind: "all" });
    expect(await screen.findByText("No changes yet.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Tracking started Sep 7. A change is published once a new size or price has been seen on a later check.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("0 changes")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Per unit" })).not.toBeInTheDocument();
  });

  it("names the kind and category in the empty message", async () => {
    renderHome();
    await screen.findByText("No changes yet.");
    fireEvent.click(screen.getByRole("button", { name: /Grew/ }));
    expect(await screen.findByText("Nothing has grown yet.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), { target: { value: "Snacks" } });
    expect(await screen.findByText("Nothing has grown yet in Snacks.")).toBeInTheDocument();
    expect(vi.mocked(getChanges).mock.calls.at(-1)?.[0]).toMatchObject({ kind: "grow", category: "Snacks" });
  });
});
