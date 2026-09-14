import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "../api/fixtures";
import { ApiError } from "../api/http";
import { AskPanel, describeAskError, productIdsOf } from "../components/AskPanel";

vi.mock("../api/client", () => ({
  ask: vi.fn(),
}));

import { ask } from "../api/client";

function renderPanel() {
  const onPending = vi.fn();
  const onAnswer = vi.fn();
  render(<AskPanel onPending={onPending} onAnswer={onAnswer} />);
  return { onPending, onAnswer };
}

beforeEach(() => {
  vi.mocked(ask).mockReset();
});

describe("AskPanel", () => {
  it("sends the question, shows the answer with its tool calls, and reports the products touched", async () => {
    vi.mocked(ask).mockResolvedValue(fx.askResponse);
    const { onPending, onAnswer } = renderPanel();

    const input = screen.getByRole("textbox", { name: "Ask about a product" });
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "Did Cheerios shrink?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(vi.mocked(ask)).toHaveBeenCalledWith("Did Cheerios shrink?", expect.any(AbortSignal));
    expect(onPending).toHaveBeenCalledWith(true);
    expect(screen.getByRole("status")).toHaveTextContent("Working on the answer");

    expect(await screen.findByText(/went from 12 oz to 10\.8 oz/)).toBeInTheDocument();
    const trace = screen.getByRole("list", { name: "Tool calls" });
    const rows = within(trace).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("search_products");
    expect(rows[0]).toHaveTextContent("query: Honey Nut Cheerios");
    expect(rows[0]).toHaveTextContent("84 ms");
    expect(screen.getByText("deepseek-flash, 2,431 tokens, 3.1 s")).toBeInTheDocument();
    expect(screen.getByText("trace 5f1c0f8f9d0a")).toBeInTheDocument();
    expect(onPending).toHaveBeenLastCalledWith(false);
    expect(onAnswer).toHaveBeenCalledWith(["0001600012479", "0001600012495"]);
  });

  it("asks an example question on click", async () => {
    vi.mocked(ask).mockResolvedValue(fx.askResponse);
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "What changed this week?" }));
    expect(vi.mocked(ask)).toHaveBeenCalledWith("What changed this week?", expect.any(AbortSignal));
    expect(screen.getByRole("textbox", { name: "Ask about a product" })).toHaveValue("What changed this week?");
    expect(await screen.findByText(/went from 12 oz/)).toBeInTheDocument();
  });

  it("shows the server's message when the daily budget is used up", async () => {
    vi.mocked(ask).mockRejectedValue(
      new ApiError(429, "You have used today's 10 questions. The budget resets at midnight UTC."),
    );
    const { onPending } = renderPanel();
    fireEvent.change(screen.getByRole("textbox", { name: "Ask about a product" }), { target: { value: "hello there" } });
    fireEvent.submit(screen.getByRole("textbox", { name: "Ask about a product" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You have used today's 10 questions. The budget resets at midnight UTC.",
    );
    expect(onPending).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("button", { name: "Ask" })).toBeEnabled();
  });
});

describe("describeAskError", () => {
  it("maps statuses to plain messages", () => {
    expect(describeAskError(new ApiError(0, null))).toBe("Could not reach the API. Check your connection and try again.");
    expect(describeAskError(new ApiError(503, "Paused for today."))).toBe("Paused for today.");
    expect(describeAskError(new ApiError(502, null))).toBe(
      "The assistant could not answer right now. Try again in a moment.",
    );
    expect(describeAskError(new Error("boom"))).toBe("The assistant could not answer right now. Try again in a moment.");
  });
});

describe("productIdsOf", () => {
  it("flattens and dedupes the ids across tool calls", () => {
    expect(productIdsOf(fx.askResponse)).toEqual(["0001600012479", "0001600012495"]);
    expect(productIdsOf({ ...fx.askResponse, tool_calls: [] })).toEqual([]);
  });
});
