import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "../api/fixtures";
import type { Stats } from "../api/types";
import { MINUS } from "../lib/format";
import { FeedPage } from "../pages/FeedPage";

vi.mock("../api/client", () => ({
  PAGE_SIZE: 30,
  getChanges: vi.fn(),
  getCategories: vi.fn(),
  getCatalog: vi.fn(),
}));

import { getCategories, getChanges } from "../api/client";

function renderFeed(stats: Stats) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route element={<Outlet context={{ stats: { status: "ok", data: stats } }} />}>
          <Route path="/" element={<FeedPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(getCategories).mockResolvedValue(fx.categories);
});

describe("FeedPage with published changes", () => {
  beforeEach(() => {
    vi.mocked(getChanges).mockResolvedValue(fx.changeList);
  });

  it("renders one ledger row per change with the same columns", async () => {
    renderFeed(fx.stats);
    expect(await screen.findByText("8 changes")).toBeInTheDocument();

    for (const name of ["Product", "Before", "After", "Size", "Unit price", "Dates"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
    const rows = screen.getAllByRole("row").filter((row) => row.classList.contains("link-row"));
    expect(rows).toHaveLength(fx.changes.length + fx.categories.length);

    const cheerios = rows.find(
      (row) =>
        within(row).queryByText("General Mills Honey Nut Cheerios™ Cereal") !== null &&
        within(row).queryByText(`${MINUS}10.0%`) !== null,
    );
    expect(cheerios).toBeDefined();
    const cells = within(cheerios!);
    expect(cells.getByText("Cheerios · Cereal and breakfast")).toBeInTheDocument();
    expect(cells.getByText("12 oz")).toBeInTheDocument();
    expect(cells.getByText("10.8 oz")).toBeInTheDocument();
    expect(cells.getAllByText("$4.29")).toHaveLength(2);
    expect(cells.getByText(`${MINUS}10.0%`)).toHaveClass("delta-down");
    expect(cells.getByText("12 oz → 10.8 oz")).toBeInTheDocument();
    expect(cells.getByText("$0.358/oz → $0.397/oz")).toBeInTheDocument();
    expect(cells.getByText("+11.1%")).toHaveClass("delta-down");
    expect(cells.getByText("Aug 13, 2026").parentElement).toHaveTextContent("Seen through Aug 13, 2026");
    expect(cells.getByText("Aug 14, 2026").parentElement).toHaveTextContent("Seen since Aug 14, 2026");
    expect(cells.getByRole("link", { name: "General Mills Honey Nut Cheerios™ Cereal" })).toHaveAttribute(
      "href",
      "/products/0001600012479",
    );
  });

  it("colors a price cut per unit as better for the shopper", async () => {
    renderFeed(fx.stats);
    await screen.findByText("8 changes");
    expect(screen.getByText(`${MINUS}14.3%`)).toHaveClass("delta-up");
  });

  it("shows what could not be compared instead of a blank", async () => {
    renderFeed(fx.stats);
    await screen.findByText("8 changes");
    expect(screen.getByText("not compared")).toBeInTheDocument();
    expect(screen.getByText("not available")).toBeInTheDocument();
    expect(screen.getByText("price +10.0%")).toHaveClass("delta-down");
  });

  it("requests the shrink kind by default and other kinds on click", async () => {
    renderFeed(fx.stats);
    await screen.findByText("8 changes");
    expect(vi.mocked(getChanges).mock.calls[0]?.[0]).toMatchObject({ kind: "shrink", offset: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Price up" }));
    expect(await screen.findByRole("button", { name: "Price up", pressed: true })).toBeInTheDocument();
    expect(vi.mocked(getChanges).mock.calls.at(-1)?.[0]).toMatchObject({ kind: "price_increase" });
  });
});

describe("FeedPage on day one", () => {
  beforeEach(() => {
    vi.mocked(getChanges).mockResolvedValue(fx.emptyChangeList);
  });

  it("states the empty feed as a fact and still lists tracked products", async () => {
    renderFeed(fx.dayOneStats);
    expect(await screen.findByText("No size decreases recorded yet.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Tracking started Sep 7, 2026. Products are checked once a day, and a change is published only after the new size or price has been observed.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("0 changes")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Unit price" })).not.toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Tracked products" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search tracked products" })).toBeInTheDocument();
    expect(await screen.findByRole("columnheader", { name: "Category" })).toBeInTheDocument();
    const snacks = screen.getByRole("link", { name: "Snacks" });
    expect(snacks).toHaveAttribute("href", "/products?category=Snacks");
    expect(within(snacks.closest("tr")!).getByText("120")).toBeInTheDocument();
    expect(screen.getByText("1,242 products · 13 categories")).toBeInTheDocument();
  });

  it("names the kind and category in the empty message", async () => {
    renderFeed(fx.dayOneStats);
    await screen.findByText("No size decreases recorded yet.");
    fireEvent.click(screen.getByRole("button", { name: "Grew" }));
    expect(await screen.findByText("No size increases recorded yet.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), { target: { value: "Snacks" } });
    expect(await screen.findByText("No size increases recorded yet in Snacks.")).toBeInTheDocument();
    expect(vi.mocked(getChanges).mock.calls.at(-1)?.[0]).toMatchObject({ kind: "grow", category: "Snacks" });
  });
});
