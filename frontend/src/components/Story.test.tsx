import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "../api/fixtures";
import { STACKED_QUERY } from "../lib/layout";
import { buildStory } from "../lib/story";
import { Story } from "./Story";

// jsdom has no layout, so the page is a list of step positions (document offsets) for each
// layout, a scroll offset, a window height, and the stacked media query's state.
const PORTRAIT = [500, 1500, 2500, 3500, 4500, 5500];
const LANDSCAPE = [300, 900, 1500, 2100, 2700, 3300];
let layout = PORTRAIT;
let scrollY = 0;
let stacked = true;
const changeListeners = new Set<() => void>();
const saved = { innerHeight: window.innerHeight };

// A step's top edge relative to the window.
function stepTop(index: number): number {
  return (layout[index] ?? 0) - scrollY;
}

function setHeight(height: number) {
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true, writable: true });
}

function activeIndex(container: HTMLElement): number {
  return [...container.querySelectorAll(".step")].findIndex((step) => step.classList.contains("is-on"));
}

async function frames() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

beforeEach(() => {
  layout = PORTRAIT;
  scrollY = 0;
  stacked = true;
  changeListeners.clear();
  setHeight(844);
  Object.defineProperty(window, "scrollY", { get: () => scrollY, configurable: true });
  vi.spyOn(window, "scrollTo").mockImplementation(((options: ScrollToOptions) => {
    scrollY = options.top ?? scrollY;
  }) as typeof window.scrollTo);
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return query === STACKED_QUERY ? stacked : false;
        },
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: (_type: string, listener: () => void) => {
          if (query === STACKED_QUERY) changeListeners.add(listener);
        },
        removeEventListener: (_type: string, listener: () => void) => changeListeners.delete(listener),
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const index = this.classList.contains("step") ? [...(this.parentElement?.children ?? [])].indexOf(this) : -1;
    const top = index >= 0 ? stepTop(index) : 0;
    return { top, bottom: top + 400, left: 0, right: 0, width: 0, height: 400, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  setHeight(saved.innerHeight);
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true, writable: true });
});

function renderStory() {
  const story = buildStory({ stats: fx.stats, changes: fx.changes, categories: fx.categories, now: new Date("2026-09-23T15:00:00Z") });
  return render(
    <MemoryRouter>
      <Story story={story} products={null} changes={null} categories={null} />
    </MemoryRouter>,
  );
}

describe("Story on a turn of the screen", () => {
  it("keeps the active step when the layout switches from stacked to side by side", async () => {
    // Portrait, stacked: the trigger is at 80% of 844 px, 675 px; step 3 (index 2) is active.
    scrollY = 2000;
    const { container } = renderStory();
    await frames();
    expect(activeIndex(container)).toBe(2);

    // Turned: 390 px tall, side by side, trigger at 62%. Without a correction the same offset
    // would put index 3 past the trigger.
    layout = LANDSCAPE;
    stacked = false;
    setHeight(390);
    act(() => {
      window.dispatchEvent(new Event("resize"));
      changeListeners.forEach((listener) => listener());
    });
    await frames();
    expect(activeIndex(container)).toBe(2);
    expect(window.scrollTo).toHaveBeenCalled();
    // The step's top sits 24 px above the new trigger line.
    expect(stepTop(2)).toBeCloseTo(390 * 0.62 - 24);
  });

  it("re-anchors on a large height change even when the layout does not switch", async () => {
    scrollY = 2000;
    const { container } = renderStory();
    await frames();
    expect(activeIndex(container)).toBe(2);

    layout = LANDSCAPE;
    setHeight(600);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    await frames();
    expect(activeIndex(container)).toBe(2);
    expect(stepTop(2)).toBeCloseTo(600 * 0.8 - 24);
  });

  it("does not scroll when a browser toolbar changes the height a little", async () => {
    scrollY = 2000;
    const { container } = renderStory();
    await frames();
    setHeight(790);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    await frames();
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(activeIndex(container)).toBe(2);
  });
});
