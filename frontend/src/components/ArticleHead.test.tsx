import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArticleHead } from "./ArticleHead";

// Lines the CSS shows in a tier: every skeleton line without that tier's x- class.
function shown(container: HTMLElement, selector: string, tier: string): number {
  return [...container.querySelectorAll(`${selector} .skl`)].filter((line) => !line.classList.contains(`x-${tier}`)).length;
}

describe("ArticleHead skeleton", () => {
  it("holds the measured line count of each head block in every width tier", () => {
    const { container } = render(<ArticleHead story={null} />);
    const tiers = ["w", "e", "d", "c", "b", "a"];
    expect(tiers.map((tier) => shown(container, "h1", tier))).toEqual([3, 2, 3, 3, 4, 4]);
    expect(tiers.map((tier) => shown(container, ".dek", tier))).toEqual([2, 2, 3, 3, 3, 4]);
    expect(tiers.map((tier) => shown(container, ".lede", tier))).toEqual([4, 3, 4, 5, 5, 6]);
    expect(tiers.map((tier) => shown(container, ".byline", tier))).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("ends each tier's set with a short line", () => {
    const { container } = render(<ArticleHead story={null} />);
    const lede = [...container.querySelectorAll<HTMLElement>(".lede .skl")].filter((line) => !line.classList.contains("x-a"));
    expect(lede.map((line) => line.style.getPropertyValue("--w")).at(-1)).toBe("42%");
  });
});
