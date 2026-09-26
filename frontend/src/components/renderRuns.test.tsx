import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderRuns } from "./Story";

describe("renderRuns", () => {
  it("keeps each legend dot on the line of the words it labels", () => {
    const { container } = render(
      <p>
        {renderRuns([
          "Color shows which way the price per unit went: ",
          { dot: "more" },
          "up for 41, ",
          { dot: "less" },
          "down for 37.",
        ])}
      </p>,
    );
    expect(container.textContent).toBe("Color shows which way the price per unit went: up for 41, down for 37.");
    const groups = [...container.querySelectorAll(".nw")];
    expect(groups.map((group) => group.textContent)).toEqual(["up for 41,", "down for 37."]);
    expect(groups.every((group) => group.firstElementChild?.classList.contains("kd"))).toBe(true);
  });

  it("takes only the first word when the clause runs on", () => {
    const { container } = render(<p>{renderRuns([{ dot: "less" }, "down for every one of the products that moved."])}</p>);
    expect(container.querySelector(".nw")!.textContent).toBe("down");
    expect(container.textContent).toBe("down for every one of the products that moved.");
  });
});
