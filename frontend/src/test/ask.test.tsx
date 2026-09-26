import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "../api/fixtures";
import { ApiError } from "../api/http";
import { AskSection, blocksOf, describeAskError, productIdsOf } from "../components/AskSection";

vi.mock("../api/client", () => ({
  ask: vi.fn(),
}));

import { ask } from "../api/client";

function Probe() {
  const location = useLocation();
  return <div data-testid="loc">{location.pathname}</div>;
}

function renderAsk() {
  return render(
    <MemoryRouter>
      <AskSection products={fx.field.products} />
      <Probe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(ask).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AskSection", () => {
  it("shows a pending line, then the answer with linked names and the tool calls", async () => {
    let resolve!: (value: typeof fx.askResponse) => void;
    vi.mocked(ask).mockImplementation(() => new Promise((r) => (resolve = r)));
    renderAsk();

    const input = screen.getByRole("textbox", { name: "Your question" });
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "Did anything shrink?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(vi.mocked(ask)).toHaveBeenCalledWith("Did anything shrink?", expect.any(AbortSignal));
    // No count until a second has passed, so the line never reads "0 seconds".
    expect(screen.getByRole("status")).toHaveTextContent(/^Asking the assistant\.$/);
    expect(screen.getByRole("button", { name: "Asking" })).toBeDisabled();

    await act(async () => resolve(fx.askResponse));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Did anything shrink?", { selector: ".ans-q" })).toBeInTheDocument();
    // Names are links that wrap with the text, not buttons.
    const link = screen.getByRole("link", { name: /Huggies Simply Clean Unscented Baby Wipes/ });
    expect(link).toHaveClass("pl");
    expect(link).toHaveAttribute("href", `/products/${fx.ids.huggies}`);
    fireEvent.click(link);
    expect(screen.getByTestId("loc")).toHaveTextContent(`/products/${fx.ids.huggies}`);

    const details = screen.getByText("How this answer was found").closest("details")!;
    const calls = within(details).getByRole("table", { name: "Tool calls made for this answer" });
    const rows = within(calls).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("list_recent_changes");
    expect(rows[0]).toHaveTextContent("kind: shrink, limit: 10");
    expect(rows[0]).toHaveTextContent("411 ms");
    expect(within(details).getByText(/Model deepseek-flash, 2,708 tokens, 5\.0 s in total\./)).toBeInTheDocument();
    expect(within(details).getByText("3992e82f28d67b461e13e5f4f070d5d8")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/questions? (left|remaining)/i);
  });

  it("asks an example question on click", async () => {
    vi.mocked(ask).mockResolvedValue(fx.askResponse);
    renderAsk();
    fireEvent.click(screen.getByRole("button", { name: "Which categories changed the most?" }));
    expect(vi.mocked(ask)).toHaveBeenCalledWith("Which categories changed the most?", expect.any(AbortSignal));
    expect(screen.getByRole("textbox", { name: "Your question" })).toHaveValue("Which categories changed the most?");
    expect(await screen.findByText(/three shrink changes were recorded/)).toBeInTheDocument();
  });

  it("shows the server's message when the daily budget is used up", async () => {
    vi.mocked(ask).mockRejectedValue(new ApiError(429, "You have used today's 10 questions. The budget resets at midnight UTC."));
    renderAsk();
    fireEvent.change(screen.getByRole("textbox", { name: "Your question" }), { target: { value: "hello there" } });
    fireEvent.submit(screen.getByRole("textbox", { name: "Your question" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You have used today's 10 questions. The budget resets at midnight UTC.",
    );
    expect(screen.getByRole("button", { name: "Ask" })).toBeEnabled();
  });

  it("gives up after 60 seconds", async () => {
    vi.useFakeTimers();
    vi.mocked(ask).mockImplementation(
      (_question, signal) =>
        new Promise((_, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    renderAsk();
    fireEvent.change(screen.getByRole("textbox", { name: "Your question" }), { target: { value: "slow one" } });
    fireEvent.submit(screen.getByRole("textbox", { name: "Your question" }).closest("form")!);
    expect(screen.getByRole("status")).toHaveTextContent(/^Asking the assistant\.$/);
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Asking the assistant. 1 second so far.");
    await act(async () => {
      vi.advanceTimersByTime(24_000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Still waiting after 25 seconds. The request gives up at 60.");
    await act(async () => {
      vi.advanceTimersByTime(36_000);
      await Promise.resolve();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("No answer after 60 seconds. Try again, or ask a narrower question.");
  });
});

describe("describeAskError", () => {
  it("maps statuses to plain messages", () => {
    expect(describeAskError(new ApiError(0, null))).toBe("Could not reach the API. Check your connection and try again.");
    expect(describeAskError(new ApiError(503, "Paused for today."))).toBe("Paused for today.");
    expect(describeAskError(new ApiError(503, null))).toBe("The assistant is paused right now. Try again later.");
    expect(describeAskError(new ApiError(429, null))).toBe("You have used today’s 10 questions. The budget resets at midnight UTC.");
    expect(describeAskError(new ApiError(502, null))).toBe("The assistant could not answer right now. Try again in a moment.");
    expect(describeAskError(new ApiError(422, "question too long"))).toBe("question too long");
    expect(describeAskError(new Error("boom"))).toBe("The assistant could not answer right now. Try again in a moment.");
  });
});

describe("answer parsing", () => {
  it("collects the product ids across tool calls", () => {
    expect(productIdsOf(fx.askResponse)).toEqual([fx.ids.philadelphia, fx.ids.huggies, fx.ids.dove]);
    expect(productIdsOf({ ...fx.askResponse, tool_calls: [] })).toEqual([]);
  });

  it("splits paragraphs and bullet lists", () => {
    expect(blocksOf("One.\n\nTwo\nlines.")).toEqual([
      { kind: "p", lines: ["One."] },
      { kind: "p", lines: ["Two lines."] },
    ]);
    expect(blocksOf("Found:\n- a\n- b\n\n1. c\n2) d")).toEqual([
      { kind: "p", lines: ["Found:"] },
      { kind: "ul", lines: ["a", "b"] },
      { kind: "ul", lines: ["c", "d"] },
    ]);
  });
});
