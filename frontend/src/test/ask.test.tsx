import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "../api/fixtures";
import { ApiError } from "../api/http";
import { AskPage, EXAMPLE_QUESTIONS } from "../pages/AskPage";

vi.mock("../api/client", () => ({
  ask: vi.fn(),
  getAskBudget: vi.fn(),
}));

import { ask, getAskBudget } from "../api/client";

function renderAsk() {
  return render(
    <MemoryRouter>
      <AskPage />
    </MemoryRouter>,
  );
}

async function askQuestion(text = "Did Honey Nut Cheerios change size?") {
  fireEvent.change(screen.getByLabelText("Question"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
}

beforeEach(() => {
  vi.mocked(getAskBudget).mockResolvedValue(fx.budget);
  vi.mocked(ask).mockReset();
});

describe("AskPage", () => {
  it("shows the daily budget and a live character count", async () => {
    renderAsk();
    expect(await screen.findByText("8 of 10 questions left today")).toBeInTheDocument();
    expect(screen.getByText("0 / 400")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();

    const example = EXAMPLE_QUESTIONS[1]!;
    fireEvent.click(screen.getByRole("button", { name: example }));
    expect(screen.getByLabelText("Question")).toHaveValue(example);
    expect(screen.getByText(`${example.length} / 400`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask" })).toBeEnabled();
  });

  it("renders the answer, the tools used, and the model line", async () => {
    vi.mocked(ask).mockResolvedValue(fx.askResponse);
    renderAsk();
    await screen.findByText("8 of 10 questions left today");
    await askQuestion();

    expect(await screen.findByText(fx.askResponse.answer)).toBeInTheDocument();
    expect(vi.mocked(ask)).toHaveBeenCalledWith("Did Honey Nut Cheerios change size?");
    expect(screen.getByText("search_products")).toBeInTheDocument();
    expect(screen.getByText('{"query":"Honey Nut Cheerios"}')).toBeInTheDocument();
    expect(screen.getByText("84 ms")).toBeInTheDocument();
    expect(
      screen.getByText(
        "model deepseek-v4-flash · 2,431 tokens · 3,120 ms · trace 5f1c0f8f9d0a4b3c8e2a7d6c1b0f9e8d",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("7 of 10 questions left today")).toBeInTheDocument();
  });

  it("disables the button while a question is pending", async () => {
    vi.mocked(ask).mockReturnValue(new Promise(() => {}));
    renderAsk();
    await screen.findByText("8 of 10 questions left today");
    await askQuestion();
    expect(screen.getByRole("button", { name: "Asking" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for the model");
  });

  it.each([
    [429, "You have used today's 10 questions. The budget resets at midnight UTC."],
    [429, "Too many requests: 10 per 1 minute"],
    [503, "The daily model budget for this demo is used up. Please try again tomorrow."],
    [502, "The assistant could not answer right now."],
  ])("shows the API detail for a %s response", async (status, detail) => {
    vi.mocked(ask).mockRejectedValue(new ApiError(status, detail));
    renderAsk();
    await screen.findByText("8 of 10 questions left today");
    await askQuestion();
    expect(await screen.findByRole("alert")).toHaveTextContent(detail);
    expect(screen.getByRole("button", { name: "Ask" })).toBeEnabled();
  });

  it("falls back to a fixed message per status when the API sends no detail", async () => {
    vi.mocked(ask).mockRejectedValue(new ApiError(503, null));
    renderAsk();
    await screen.findByText("8 of 10 questions left today");
    await askQuestion();
    expect(await screen.findByRole("alert")).toHaveTextContent("The daily model budget is used up.");
  });

  it("explains a network failure", async () => {
    vi.mocked(ask).mockRejectedValue(new ApiError(0, null));
    renderAsk();
    await screen.findByText("8 of 10 questions left today");
    await askQuestion();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the API.");
  });
});
