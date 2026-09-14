import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "../api/fixtures";
import { ApiError } from "../api/http";
import { ProductPage } from "../pages/ProductPage";

vi.mock("../api/client", () => ({
  getProduct: vi.fn(),
}));

import { getProduct } from "../api/client";

function renderProduct(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/products/${id}`]}>
      <Routes>
        <Route path="/products/:id" element={<ProductPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(getProduct).mockReset();
});

describe("ProductPage", () => {
  it("shows the current state, the history, the chart, and the changes", async () => {
    vi.mocked(getProduct).mockResolvedValue(fx.cheeriosDetail);
    renderProduct(fx.cheeriosDetail.product.id);

    expect(
      await screen.findByRole("heading", { name: "General Mills Honey Nut Cheerios™ Cereal" }),
    ).toBeInTheDocument();
    expect(vi.mocked(getProduct)).toHaveBeenCalledWith("0001600012479", expect.any(AbortSignal));
    expect(screen.getByText("Kroger id 0001600012479, tracked since Jul 6, last checked Sep 7")).toBeInTheDocument();

    const facts = screen.getByRole("heading", { name: "Now" }).closest("section")!;
    expect(within(facts).getAllByText("10.8 oz")).toHaveLength(2);
    expect(within(facts).getByText("$0.397/oz")).toBeInTheDocument();
    expect(within(facts).getByText("parsed by rules")).toBeInTheDocument();
    expect(within(facts).getByText("Aug 14, 2026")).toBeInTheDocument();

    const history = screen.getByRole("heading", { name: "History" }).closest("section")!;
    expect(within(history).getByText("3 states")).toBeInTheDocument();
    for (const name of ["Size", "Price", "Per unit", "Seen"]) {
      expect(within(history).getByRole("columnheader", { name })).toBeInTheDocument();
    }
    expect(within(history).getByText("Jul 6 → 27")).toBeInTheDocument();
    expect(within(history).getByText("22 days")).toBeInTheDocument();
    expect(
      within(history).getByRole("img", {
        name: /^Unit price over time, from \$0\.333\/oz on Jul 6, 2026 to \$0\.397\/oz on Sep 7, 2026\.$/,
      }),
    ).toBeInTheDocument();

    const changes = screen.getByRole("heading", { name: "Changes" }).closest("section")!;
    expect(within(changes).getByText("2 changes")).toBeInTheDocument();
    expect(within(changes).getByRole("columnheader", { name: "Change" })).toBeInTheDocument();
    expect(within(changes).getByText("Shrank")).toHaveClass("kind", "worse");
    expect(within(changes).getByText("Price up")).toBeInTheDocument();
    expect(within(changes).getByText("$3.99 → $4.29")).toBeInTheDocument();
  });

  it("states a single observed state instead of drawing a chart", async () => {
    vi.mocked(getProduct).mockResolvedValue(fx.singleSnapshotDetail);
    renderProduct(fx.singleSnapshotDetail.product.id);
    expect(await screen.findByText("Nothing has changed yet.")).toBeInTheDocument();
    expect(screen.getByText("One state observed so far.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("1 state")).toBeInTheDocument();
  });

  it("labels model parses with their confidence", async () => {
    vi.mocked(getProduct).mockResolvedValue(fx.details[fx.products.milk.id]!);
    renderProduct(fx.products.milk.id);
    expect(await screen.findByText("parsed by language model, confidence 0.85")).toBeInTheDocument();
    expect(screen.getByText("64 fl oz")).toBeInTheDocument();
    expect(screen.queryByText("Promo price")).not.toBeInTheDocument();
  });

  it("shows a promo price when present", async () => {
    vi.mocked(getProduct).mockResolvedValue(fx.details[fx.products.oreo.id]!);
    renderProduct(fx.products.oreo.id);
    expect(await screen.findByText("Promo price")).toBeInTheDocument();
    const facts = screen.getByRole("heading", { name: "Now" }).closest("section")!;
    expect(within(facts).getByText("$3.99")).toBeInTheDocument();
    expect(within(facts).getByText("$4.99")).toBeInTheDocument();
  });

  it("says when a product id is unknown", async () => {
    vi.mocked(getProduct).mockRejectedValue(new ApiError(404, "product not found"));
    renderProduct("0000000000000");
    expect(await screen.findByRole("heading", { name: "Product not found." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the start" })).toHaveAttribute("href", "/");
  });
});
