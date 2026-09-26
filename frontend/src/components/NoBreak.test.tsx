import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NoBreak, noBreak } from "./NoBreak";

function wholes(text: string): string[] {
  const { container } = render(<p>{noBreak(text)}</p>);
  expect(container.textContent).toBe(text);
  return [...container.querySelectorAll(".nw")].map((element) => element.textContent ?? "");
}

describe("noBreak", () => {
  it("returns text with nothing to keep whole unchanged", () => {
    expect(noBreak("Each dot is one product.")).toBe("Each dot is one product.");
    expect(wholes("5-Blade Razors, $5.49 to $5.99")).toEqual([]);
  });

  it("keeps quoted sizes, clock times and number ranges on one line", () => {
    expect(wholes("The listed size went from “2 ct / 8 oz each” to “2 ct / 8 oz”.")).toEqual(["“2 ct / 8 oz each”", "“2 ct / 8 oz”"]);
    expect(wholes("Last checked Sep 23 at 7:07 a.m. Eastern.")).toEqual(["7:07 a.m."]);
    expect(wholes("Oscar Mayer Bacon, Box, 9-11 slices")).toEqual(["9-11"]);
    expect(wholes("Diapers Size 4 (22-37 lbs), 1.5-2.5 oz")).toEqual(["22-37", "1.5-2.5"]);
  });

  it("adds no characters, so copied text matches the source", () => {
    const text = "Size 3 (16-28 lbs) at 11:00 a.m., “192 ct”";
    const { container } = render(<NoBreak text={text} />);
    expect(container.textContent).toBe(text);
    expect(container.textContent).not.toMatch(/[⁠­‑]/);
  });
});
