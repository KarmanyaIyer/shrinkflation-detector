import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import * as fx from "../api/fixtures";
import type { ChangeOut } from "../api/types";
import { buildStory } from "../lib/story";
import { SizeCards } from "./SizeCards";

function storyWith(changes: ChangeOut[]) {
  return buildStory({ stats: fx.stats, changes, categories: fx.categories, now: new Date("2026-09-23T15:00:00Z") });
}

function cards(changes: ChangeOut[], step: "shrinks" | "grows", compact = false) {
  const story = storyWith(changes);
  const { container } = render(
    <MemoryRouter>
      <SizeCards shrinks={story.shrinks} grows={story.grows} step={step} compact={compact} />
    </MemoryRouter>,
  );
  return container;
}

describe("SizeCards", () => {
  it("draws one card for a product whose listed size went down and later back up", () => {
    const huggies = fx.changes.find((c) => c.product.id === fx.ids.huggies)!;
    const back: ChangeOut = {
      ...huggies,
      id: huggies.id + 1000,
      kind: "grow",
      before: huggies.after,
      after: huggies.before,
      unit_price_change_pct: "-70.83",
      detected_at: "2026-09-21T11:05:00Z",
      after_seen_at: "2026-09-21T11:05:00Z",
    };
    const container = cards([back, ...fx.changes], "grows");
    const found = container.querySelectorAll(`.sc[data-id="${fx.ids.huggies}"]`);
    expect(found).toHaveLength(1);
    expect(found[0]).toHaveClass("grow", "on");
    expect(found[0]).toHaveTextContent("“56 ct”");
  });

  it("dims the other group and gives every card its before and after heights", () => {
    const container = cards(fx.changes, "grows");
    const shrinks = [...container.querySelectorAll(".sc.shrink")];
    expect(shrinks).toHaveLength(3);
    for (const card of shrinks) {
      expect(card).not.toHaveClass("on");
      const box = card.querySelector<HTMLElement>(".pk")!;
      // The after box is drawn at --ha, so a dimmed card shows its final state.
      expect(box.style.getPropertyValue("--ha")).toMatch(/%$/);
      expect(box.style.getPropertyValue("--hb")).toMatch(/%$/);
    }
    // Both groups share the stage, so each has its head.
    expect([...container.querySelectorAll(".sc-h")].map((head) => head.textContent)).toEqual(["Listed size went down", "Listed size went up"]);
  });

  it("drops the group head when only one group exists", () => {
    const container = cards(
      fx.changes.filter((c) => c.kind !== "grow"),
      "shrinks",
    );
    expect(container.querySelectorAll(".sc-h")).toHaveLength(0);
    expect(container.querySelectorAll(".sc.shrink.on")).toHaveLength(3);
  });
});
