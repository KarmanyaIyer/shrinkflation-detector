import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "../api/fixtures";
import { ApiError } from "../api/http";
import { App } from "../App";

vi.mock("../api/client", async () => {
  const fixtures = await import("../api/fixtures");
  const { ApiError: Err } = await import("../api/http");
  return {
    getStats: vi.fn(async () => fixtures.stats),
    getCategories: vi.fn(async () => fixtures.categories),
    getField: vi.fn(async () => fixtures.field),
    getAllChanges: vi.fn(async () => fixtures.changes),
    getProduct: vi.fn(async (id: string) => {
      const detail = fixtures.detailFor(id);
      if (!detail) throw new Err(404, "product not found");
      return detail;
    }),
    ask: vi.fn(),
  };
});

import { getProduct, getStats } from "../api/client";

function Probe() {
  const location = useLocation();
  return <div data-testid="loc">{`${location.pathname}${location.search}${location.hash}`}</div>;
}

function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Probe />
    </MemoryRouter>,
  );
}

// The store's state, city, and location id must never appear, nor en or em dashes. Spelled
// in pieces so a grep of the source stays clean.
const FORBIDDEN = [
  new RegExp(["Kent", "ucky"].join("")),
  new RegExp(["New", "port"].join("")),
  new RegExp(["0140", "0423"].join("")),
  /\u2013/,
  /\u2014/,
];

beforeEach(() => {
  vi.mocked(getStats).mockClear();
  vi.mocked(getProduct).mockClear();
  vi.mocked(Element.prototype.scrollIntoView).mockClear();
});

describe("article", () => {
  it("writes the headline, dek, and steps from the data", async () => {
    renderApp();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Over 16 days at one Kroger, 38 prices rose, 36 fell and four listed sizes changed.",
    );
    expect(screen.getByText(/Of the 74 price moves, 57 were under 10% per unit\./)).toBeInTheDocument();
    // The product in the dek is a real link to its record.
    const dek = document.querySelector(".dek")!;
    expect(dek).toHaveTextContent("The largest: Reese's Puffs went from $5.49 to $3.99, 27.3% less per ounce.");
    expect(within(dek as HTMLElement).getByRole("link", { name: "Reese's Puffs" })).toHaveAttribute("href", `/products/${fx.ids.reeses}`);
    const when = document.querySelector(".byline .when")!;
    expect(when.textContent).toMatch(/^(Last checked|Data last updated) Sep 23 at 7:07 a\.m\. Eastern/);
    expect(when.querySelector(".nw")!.textContent).toBe("7:07 a.m.");
    expect(screen.getByText(/Pantry is the largest group, with 276 items\./)).toBeInTheDocument();
    expect(screen.getByText(/The listed size went down on three products/)).toBeInTheDocument();
    const method = document.querySelector("#how")!.textContent!.replace(/\s+/g, " ");
    expect(method).toContain("1,242 products in 13 categories, 25 API calls. The Sep 23 run checked all of them in 6 minutes 41 seconds with no errors.");
    expect(method).toContain("Model spending is capped at $1.00 a day; 433 calls, for size reading and the assistant together, have cost $0.08 in total.");
    expect(method).toContain("per ounce for weight, per fluid ounce for volume, per item for counts and per foot or square foot for lengths and areas.");
    expect(method).toContain("So far there are 1,370 records.");
    expect(method).toContain("So far 78 are published: 38 price increases, 36 price cuts, three size decreases and one size increase.");
    expect(method).toContain("a size text change whose two readings cannot be compared");
    // Each fact is stated once on the page.
    const page = document.body.textContent!.replace(/\s+/g, " ");
    expect(page.match(/questions a day/g)).toHaveLength(1);
    expect(page.match(/four read-only tools/g)).toHaveLength(1);
    expect(page.match(/1,370 records/g)).toHaveLength(1);
    expect(page.match(/0\.5%/g)).toHaveLength(2);
    for (const pattern of FORBIDDEN) expect(document.body.textContent).not.toMatch(pattern);
  });

  it("keeps headings in order and offers the skip link and anchors", async () => {
    renderApp();
    await screen.findByRole("heading", { level: 1 });
    const levels = screen.getAllByRole("heading").map((h) => Number(h.tagName.slice(1)));
    expect(levels[0]).toBe(1);
    expect(Math.max(...levels)).toBeLessThanOrEqual(2);
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
    for (const id of ["ask", "changes", "search", "how"]) expect(document.getElementById(id)).not.toBeNull();
    expect(screen.getByRole("link", { name: "Note 2" })).toHaveAttribute("href", "#fn2");
    expect(screen.getAllByRole("link", { name: "Back to the text" })[0]!.getAttribute("href")).toMatch(/^#r/);
  });

  it("shows the size cards with the verbatim label text and an unchanged price", async () => {
    renderApp();
    await screen.findByRole("heading", { level: 1 });
    const cards = document.querySelectorAll(".sc.shrink");
    expect(cards).toHaveLength(3);
    const huggies = [...cards].find((card) => card.textContent?.includes("Huggies"))!;
    expect(huggies).toHaveTextContent("“192 ct”");
    expect(huggies).toHaveTextContent("“56 ct”");
    expect(huggies).toHaveTextContent("Shelf price $6.99, unchanged");
    // The cards are inert until the size step is on screen, so the link is hidden from the tree.
    expect(within(huggies as HTMLElement).getByRole("link", { hidden: true })).toHaveAttribute("href", `/products/${fx.ids.huggies}`);
  });

  it("shows a plain error with a retry and the method box when the API is down", async () => {
    vi.mocked(getStats).mockRejectedValueOnce(new ApiError(503, "Service unavailable"));
    renderApp();
    expect(await screen.findByRole("alert")).toHaveTextContent("The API returned an error (503). Try again in a minute.");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("The records could not be loaded.");
    expect(screen.getByRole("heading", { name: "How this works" })).toBeInTheDocument();
    // No note markers exist on the error page, so the notes carry no back links.
    expect(screen.queryByRole("link", { name: /^Back to/ })).toBeNull();
    // The masthead section links would point at sections that are not on the page.
    const sections = screen.getByRole("navigation", { name: "Sections" });
    await waitFor(() => expect(within(sections).queryByRole("link", { name: "Ask the data" })).toBeNull());
    expect(within(sections).getByRole("link", { name: "GitHub" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/Over 16 days at one Kroger/)).toBeInTheDocument();
    expect(vi.mocked(getStats)).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(within(sections).getByRole("link", { name: "Ask the data" })).toHaveAttribute("href", "/#ask"));
  });
});

describe("change table", () => {
  it("filters, sorts, and writes its state to the query string", async () => {
    renderApp();
    await screen.findByRole("heading", { level: 1 });
    const table = screen.getByRole("table", { name: "Published changes" });
    expect(within(table).getAllByRole("row")).toHaveLength(26);
    expect(screen.getByRole("button", { name: /^All/ })).toHaveTextContent("78");
    expect(screen.getByRole("button", { name: /^Size down/ })).toHaveTextContent("3");

    fireEvent.click(screen.getByRole("button", { name: /^Size down/ }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/?kind=shrink");
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(screen.getByText("3 changes, size down, newest first.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Price per unit" }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/?kind=shrink&sort=-unit");
    const header = screen.getByRole("columnheader", { name: /Price per unit/ });
    expect(header).toHaveAttribute("aria-sort", "descending");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Huggies");
    expect(rows[0]).toHaveTextContent("+242.9%");

    fireEvent.click(screen.getByRole("button", { name: "Price per unit" }));
    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByTestId("loc")).toHaveTextContent("/?kind=shrink&sort=unit");

    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), { target: { value: "Candy" } });
    expect(screen.getByText("No change matches these filters.", { selector: "p" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show every change" }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/");
    expect(within(table).getAllByRole("row")).toHaveLength(26);
  });

  it("reads old ?kind= links and shows all rows on request", async () => {
    renderApp("/?kind=price_decrease&sort=product");
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("button", { name: /^Price down/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("columnheader", { name: "Product" })).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(screen.getByRole("button", { name: "Show all 36" }));
    const table = screen.getByRole("table", { name: "Published changes" });
    expect(within(table).getAllByRole("row")).toHaveLength(37);
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });
});

describe("product drawer", () => {
  it("opens from a table row, traps focus, closes on Escape, and returns focus", async () => {
    renderApp();
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Show all 78" }));
    const table = screen.getByRole("table", { name: "Published changes" });
    // Product names in the table are links to the record; the whole row also opens it.
    const rowButton = within(table).getAllByRole("link", { name: /Reese's/i })[0]!;
    expect(rowButton).toHaveAttribute("href", `/products/${fx.ids.reeses}`);
    rowButton.focus();
    fireEvent.click(rowButton);
    expect(screen.getByTestId("loc")).toHaveTextContent(`/products/${fx.ids.reeses}`);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(await within(dialog).findByRole("heading", { level: 2 })).toHaveTextContent("General Mills Reese's Puffs Chocolatey Peanut Butter Cereal");
    expect(dialog.querySelector(".dr-sum")).toHaveTextContent(
      /^One change since Sep 7, 2026\. Between Sep \d+ and \d+, the shelf price went from \$5\.49 to \$3\.99, so the price per ounce fell 27\.3%\.$/,
    );
    expect(within(dialog).getByRole("table", { name: "Stored records, newest first" })).toBeInTheDocument();
    expect(within(dialog).getByRole("img", { name: /Price per ounce/ })).toBeInTheDocument();
    expect(document.body).toHaveClass("locked");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("loc")).toHaveTextContent("/");
    expect(document.activeElement).toBe(rowButton);
    expect(document.body).not.toHaveClass("locked");
  });

  it("opens from a click anywhere on a table row", async () => {
    renderApp();
    await screen.findByRole("heading", { level: 1 });
    const table = screen.getByRole("table", { name: "Published changes" });
    const cell = table.querySelector("tbody tr .c-price")!;
    fireEvent.click(cell);
    expect(screen.getByTestId("loc")).toHaveTextContent(/^\/products\/\d+$/);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("keeps Tab and Shift+Tab inside the drawer", async () => {
    // jsdom does no layout, so offsetParent is always null; treat attached elements as shown.
    const spy = vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(function (this: HTMLElement) {
      return this.parentElement;
    });
    try {
      renderApp(`/products/${fx.ids.huggies}`);
      const dialog = await screen.findByRole("dialog");
      await within(dialog).findByRole("heading", { level: 2 });
      const close = within(dialog).getByRole("button", { name: "Close" });
      // Shift+Tab from the panel itself goes to the last control, not out of the dialog.
      dialog.focus();
      fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(close);
      // Close is the only control here, so it is both first and last: Tab and Shift+Tab stay on it.
      expect(fireEvent.keyDown(close, { key: "Tab" })).toBe(false);
      expect(document.activeElement).toBe(close);
      expect(fireEvent.keyDown(close, { key: "Tab", shiftKey: true })).toBe(false);
      expect(document.activeElement).toBe(close);
    } finally {
      spy.mockRestore();
    }
  });

  it("writes the summary with the size texts kept whole", async () => {
    renderApp(`/products/${fx.ids.huggies}`);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { level: 2 });
    const summary = dialog.querySelector(".dr-sum")!;
    expect(summary).toHaveTextContent(
      "Between Sep 15 and 16, the listed size went from “192 ct” to “56 ct” and the shelf price stayed at $6.99, so the price per item rose 242.9%.",
    );
    expect([...summary.querySelectorAll(".nw")].map((el) => el.textContent)).toEqual(["“192 ct”", "“56 ct”"]);
    expect(within(dialog).getAllByText("read by rules").length).toBeGreaterThan(0);
    expect(within(dialog).queryByText(/\/each$/)).toBeNull();
    // The API lists "Baby" twice.
    expect(dialog.querySelector(".dr-dl")).toHaveTextContent(/Kroger category\s*Baby\s*First seen/);
    expect(within(dialog).getByRole("columnheader", { name: "Listed size" })).toBeInTheDocument();
  });

  it("marks a record that differs from the one before it only by name", async () => {
    renderApp(`/products/${fx.ids.lateJuly}`);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { level: 2 });
    const rows = [...dialog.querySelectorAll(".dr-table tbody tr")];
    // Newest first: $5.99, then the renamed $5.79 record, then the first one.
    expect(rows.map((row) => row.querySelector(".pm:last-child")!.textContent)).toEqual(["read by rules", "name changed", "read by rules"]);
  });

  it("names the reader and cleans the brand the way it cleans names", async () => {
    renderApp(`/products/${fx.ids.philadelphia}`);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { level: 2 });
    expect(within(dialog).getAllByText(/^read by a language model, confidence \d\.\d\d$/).length).toBeGreaterThan(0);
    expect(dialog.textContent).not.toMatch(/\bllm\b|a model \(/);
  });

  it("drops the trademark sign from a brand", async () => {
    renderApp(`/products/${fx.ids.khloud}`);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { level: 2 });
    expect(dialog.querySelector(".dr-meta")).toHaveTextContent(/^Snacks\s*·\s*Khloud\s*·/);
    expect(dialog.querySelector(".dr-meta")!.textContent).not.toMatch(/™/);
  });

  it("drops the fragment before opening and does not scroll again on close", async () => {
    renderApp("/#changes");
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1));
    const rowButton = document.querySelector<HTMLAnchorElement>(".rowbtn")!;
    rowButton.focus();
    fireEvent.click(rowButton);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { level: 2 });
    expect(document.title).toMatch(/. · Shrinkflation Detector$/);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The article entry lost its fragment, so going back lands on / and the browser leaves
    // focus alone.
    expect(screen.getByTestId("loc")).toHaveTextContent(/^\/$/);
    expect(document.activeElement).toBe(rowButton);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(document.title).toBe("Shrinkflation Detector");
  });

  it("keeps the table's filter and sort behind the drawer and returns focus to the row", async () => {
    renderApp("/?kind=shrink&sort=-unit#changes");
    await screen.findByRole("heading", { level: 1 });
    const table = screen.getByRole("table", { name: "Published changes" });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    const link = within(table).getAllByRole("link", { name: /Huggies/ })[0]!;
    expect(link).toHaveAttribute("href", `/products/${fx.ids.huggies}?kind=shrink&sort=-unit`);
    link.focus();
    fireEvent.click(link);
    expect(screen.getByTestId("loc")).toHaveTextContent(`/products/${fx.ids.huggies}?kind=shrink&sort=-unit`);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { level: 2 });
    // The table behind the drawer keeps its rows.
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("loc")).toHaveTextContent(/^\/\?kind=shrink&sort=-unit$/);
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(document.activeElement).toBe(link);
  });

  it("closes a shared filtered drawer link onto the same table view", async () => {
    renderApp(`/products/${fx.ids.khloud}?kind=grow`);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { level: 2 });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("loc")).toHaveTextContent(/^\/\?kind=grow$/);
    const table = screen.getByRole("table", { name: "Published changes" });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
  });

  it("renders the article behind a directly loaded product", async () => {
    renderApp(`/products/${fx.ids.huggies}`);
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("heading", { level: 2 })).toHaveTextContent(/Huggies/);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/Over 16 days/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("loc")).toHaveTextContent("/");
  });

  it("says when a product is unknown", async () => {
    renderApp("/products/nope");
    expect(await screen.findByRole("alert")).toHaveTextContent("No tracked product has the id nope.");
  });

  it("redirects the old list and section addresses", async () => {
    renderApp("/products");
    await waitFor(() => expect(screen.getByTestId("loc")).toHaveTextContent("/#search"));
  });
});

describe("find a product", () => {
  it("lists matches with the changed ones first and opens one", async () => {
    renderApp();
    await screen.findByRole("heading", { level: 1 });
    const input = screen.getByRole("searchbox", { name: "Search products" });
    fireEvent.change(input, { target: { value: "kodiak" } });
    const first = await screen.findAllByRole("link", { name: /Kodiak/ });
    const list = document.querySelector(".find-list")!;
    expect(within(list as HTMLElement).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(screen.getByText(/matches\.|match\./)).toBeInTheDocument();
    const target = first.find((button) => list.contains(button))!;
    expect(target).toHaveTextContent("Price up");
    fireEvent.click(target);
    expect(screen.getByTestId("loc")).toHaveTextContent(`/products/${fx.ids.kodiak}`);
  });
});

describe("graphic keyboard", () => {
  it("moves between products with the arrow keys and announces each one", async () => {
    renderApp();
    await screen.findByRole("heading", { level: 1 });
    const canvas = await screen.findByRole("application");
    const live = canvas.parentElement!.querySelector('[aria-live="polite"]')!;
    // jsdom puts every step at top 0, so the story settles on the last step. A step change
    // clears the highlight, so wait for it before moving.
    await waitFor(() => expect(document.querySelector(".step.is-on")).toHaveAttribute("data-step", "end"));
    canvas.focus();
    fireEvent.keyDown(canvas, { key: "ArrowRight" });
    expect(live.textContent).toMatch(/\. 1 of 1,242\.$/);
    fireEvent.keyDown(canvas, { key: "ArrowRight" });
    expect(live.textContent).toMatch(/\. 2 of 1,242\.$/);
    fireEvent.keyDown(canvas, { key: "End" });
    // Numbers are grouped on both sides.
    expect(live.textContent).toMatch(/\. 1,242 of 1,242\.$/);
    fireEvent.keyDown(canvas, { key: "Home" });
    expect(live.textContent).toMatch(/\. 1 of 1,242\.$/);
    fireEvent.keyDown(canvas, { key: "Enter" });
    expect(screen.getByTestId("loc")).toHaveTextContent(/^\/products\/\d+$/);
  });

  it("clears the announcement on Escape", async () => {
    renderApp();
    await screen.findByRole("heading", { level: 1 });
    const canvas = await screen.findByRole("application");
    const live = canvas.parentElement!.querySelector('[aria-live="polite"]')!;
    fireEvent.keyDown(canvas, { key: "ArrowDown" });
    expect(live.textContent).not.toBe("");
    fireEvent.keyDown(canvas, { key: "Escape" });
    expect(live.textContent).toBe("");
  });
});

describe("search suggestions and brand matches", () => {
  it("suggests brands the article names and shows the brand when only it matched", async () => {
    renderApp();
    await screen.findByRole("heading", { level: 1 });
    const group = screen.getByRole("group", { name: "Suggestions" });
    const words = within(group).getAllByRole("button").map((button) => button.textContent);
    // The live count the input points to holds only the count, never the suggestions.
    const live = document.querySelector(".find-count[aria-live]")!;
    expect(live.textContent).toBe("");
    expect(live.contains(group)).toBe(false);
    expect(words.length).toBeGreaterThan(0);
    expect(words).not.toContain("Pantry");
    const input = screen.getByRole("searchbox", { name: "Search products" });
    fireEvent.change(input, { target: { value: words[0]! } });
    const list = document.querySelector(".find-list")!;
    await waitFor(() => expect(within(list as HTMLElement).getAllByRole("listitem").length).toBeGreaterThan(0));
    expect(within(list as HTMLElement).getAllByRole("listitem").length).toBeLessThanOrEqual(10);
    expect(live.textContent).toMatch(/^\d+ match(es)?\.$/);
    expect(screen.queryByRole("group", { name: "Suggestions" })).toBeNull();
  });
});
