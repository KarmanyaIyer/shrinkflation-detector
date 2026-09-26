import { describe, expect, it } from "vitest";
import {
  CAPTIONS,
  NAME_ROWS,
  annotationRows,
  nameRows,
  placeAnnotations,
  placeCaptions,
  tickAnchor,
  type AnnotationInput,
  type AnnotationOptions,
  type Box,
  type Measure,
} from "./annotate";

// Bold text is a little wider than regular, as in the real font.
const measure: Measure = (text, bold) => text.length * (bold ? 7.2 : 6.6);

const options: AnnotationOptions = {
  width: 600,
  narrow: false,
  base: 100,
  rowH: 16,
  gap: 6,
  maxWidth: 200,
  ascent: 10,
  descent: 3,
  leaderGap: 9,
};

function label(id: string, x: number, prefer: "start" | "end", text: string): AnnotationInput {
  return { id, label: text, price: "", percent: "+10%", x, y: 150, prefer };
}

function overlap(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.top < b.bottom && b.top < a.bottom;
}

describe("annotationRows", () => {
  const input = { label: "Foo", price: "$1.00 to $2.00", percent: "+10.0% per oz" };

  it("puts the numbers on one row on wide stages and two on narrow ones", () => {
    expect(annotationRows(input, false, 200, measure)).toEqual([
      { text: "Foo", bold: true },
      { text: "$1.00 to $2.00, +10.0% per oz", bold: false },
    ]);
    expect(annotationRows(input, true, 200, measure)).toEqual([
      { text: "Foo", bold: true },
      { text: "$1.00 to $2.00", bold: false },
      { text: "+10.0% per oz", bold: false },
    ]);
  });

  it("shows the percent alone when there is no price", () => {
    const noPrice = { ...input, price: "" };
    expect(annotationRows(noPrice, false, 200, measure)).toEqual([
      { text: "Foo", bold: true },
      { text: "+10.0% per oz", bold: false },
    ]);
    expect(annotationRows(noPrice, true, 200, measure)).toEqual(annotationRows(noPrice, false, 200, measure));
  });

  it("wraps a name into at most two bold rows within the width", () => {
    const two = { ...input, label: "Tate's Bake Shop Pumpkin Spice Cookies" };
    const rows = annotationRows(two, false, 170, measure);
    const name = rows.filter((row) => row.bold);
    expect(name.length).toBe(2);
    expect(name.map((row) => row.text).join(" ")).toBe(two.label);
    for (const row of name) expect(measure(row.text, true)).toBeLessThanOrEqual(170);
    expect(rows[rows.length - 1]).toEqual({ text: "$1.00 to $2.00, +10.0% per oz", bold: false });
  });

  it("shortens a longer name to its brand and last words", () => {
    const label = "Kodiak Protein-Packed Buttermilk and Vanilla Frozen Thick and Fluffy Power Waffles";
    const rows = nameRows(label, 1, 170, (text) => measure(text, true));
    expect(rows.length).toBeLessThanOrEqual(NAME_ROWS);
    expect(rows.join(" ")).toBe("Kodiak … Thick and Fluffy Power Waffles");
    for (const row of rows) expect(measure(row, true)).toBeLessThanOrEqual(170);
    // Narrower: fewer last words, and the tail never starts on a joining word.
    const narrow = nameRows(label, 1, 110, (text) => measure(text, true)).join(" ");
    expect(narrow).toMatch(/^Kodiak … /);
    expect(narrow).not.toMatch(/… (and|with|of) /);
    // Brand words at the start stay whole.
    expect(nameRows("Kodiak Cakes Protein-Packed Buttermilk and Vanilla Frozen Thick and Fluffy Power Waffles", 2, 170, (t) => measure(t, true)).join(" ")).toMatch(
      /^Kodiak Cakes … .*Waffles$/,
    );
    // A name that fits keeps every word.
    expect(nameRows("Purina ONE", 1, 170, (text) => measure(text, true))).toEqual(["Purina ONE"]);
  });
});

describe("placeAnnotations", () => {
  it("sits on the preferred side of the dot when it is free", () => {
    const [a] = placeAnnotations([label("a", 300, "start", "Alpha Beta")], options, measure);
    // Two rows (the name and "+10%"): the block reaches one row height plus the ascent above the
    // baseline, and the bottom is the leader below it.
    expect(a).toMatchObject({ id: "a", anchor: "start", x0: 306, textX: 306, base: 100, leaderY: 109, top: 74, bottom: 109 });
    expect(a!.rows).toHaveLength(2);
    expect(a!.x1).toBeCloseTo(378, 5);
    const [b] = placeAnnotations([label("b", 300, "end", "Alpha Beta")], options, measure);
    expect(b).toMatchObject({ anchor: "end", x1: 294, textX: 294, base: 100 });
    expect(b!.x0).toBeCloseTo(222, 5);
  });

  it("flips to the other side when the preferred box would cross the stage edge", () => {
    const placed = placeAnnotations(
      [label("left", 10, "end", "Alpha Beta"), label("right", 590, "start", "Gamma Delta")],
      options,
      measure,
    );
    expect(placed.map((p) => p.anchor)).toEqual(["start", "end"]);
    for (const p of placed) {
      expect(p.x0).toBeGreaterThanOrEqual(0);
      expect(p.x1).toBeLessThanOrEqual(options.width);
    }
  });

  it("slides a label inside when neither side fits", () => {
    const wide = label("w", 300, "start", "x".repeat(100));
    const [p] = placeAnnotations([wide], options, measure);
    expect(p!.x0).toBe(0);
    expect(p!.x1).toBe(options.width);
  });

  it("flips a later label to its other side when the preferred side is taken", () => {
    const placed = placeAnnotations(
      [label("a", 400, "end", "Alpha Beta"), label("b", 300, "start", "Gamma Delta")],
      options,
      measure,
    );
    const [a, b] = placed;
    expect(a).toMatchObject({ anchor: "end", x1: 394, base: 100 });
    expect(b).toMatchObject({ anchor: "end", x1: 294, base: 100 });
    expect(b!.x0).toBeCloseTo(300 - 6 - measure("Gamma Delta", true), 5);
    expect(overlap(a!, b!)).toBe(false);
  });

  it("lifts a later label above the one it would hit when both sides collide", () => {
    const placed = placeAnnotations(
      [label("a", 300, "start", "Alpha Beta"), label("b", 320, "start", "Gamma Delta")],
      options,
      measure,
    );
    const [a, b] = placed;
    expect(a).toMatchObject({ anchor: "start", x0: 306, base: 100, top: 74 });
    // Lifted so its leader clears the top of a: 74 - 6 (lift gap) - 3 (descent) - 9 (leader).
    expect(b).toMatchObject({ anchor: "start", x0: 326, base: 56, top: 30, bottom: 65 });
    expect(b!.bottom).toBeLessThan(a!.top);
    expect(overlap(a!, b!)).toBe(false);
  });

  it("avoids an obstacle box", () => {
    const obstacle: Box = { x0: 306, x1: 400, top: 80, bottom: 110 };
    const [side] = placeAnnotations([label("a", 300, "start", "Alpha Beta")], options, measure, [obstacle]);
    expect(side).toMatchObject({ anchor: "end", x1: 294, base: 100 });
    expect(overlap(side!, obstacle)).toBe(false);

    const wall: Box = { x0: 0, x1: 600, top: 80, bottom: 110 };
    const [lifted] = placeAnnotations([label("a", 300, "start", "Alpha Beta")], options, measure, [wall]);
    expect(lifted).toMatchObject({ anchor: "start", base: 62, top: 36, bottom: 71 });
    expect(overlap(lifted!, wall)).toBe(false);
  });

  it("keeps a crowd of labels inside the stage and apart", () => {
    const inputs = [40, 60, 80, 100, 560, 580].map((x, i) =>
      label(`n${i}`, x, i % 2 ? "end" : "start", `Label number ${i} here`),
    );
    const placed = placeAnnotations(inputs, options, measure);
    expect(placed).toHaveLength(inputs.length);
    for (const p of placed) {
      expect(p.x0).toBeGreaterThanOrEqual(0);
      expect(p.x1).toBeLessThanOrEqual(options.width);
    }
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        expect(overlap(placed[i]!, placed[j]!)).toBe(false);
      }
    }
  });
});

describe("placeCaptions", () => {
  it("uses the long pair when both fit either side of the zero line", () => {
    expect(placeCaptions(300, 600, measure)).toEqual([
      { text: CAPTIONS.long[0], x: 290, anchor: "end" },
      { text: CAPTIONS.long[1], x: 310, anchor: "start" },
    ]);
  });

  it("falls back to the short pair when the long one would cross an edge", () => {
    expect(placeCaptions(100, 600, measure)).toEqual([
      { text: "← Fell", x: 90, anchor: "end" },
      { text: "Rose →", x: 110, anchor: "start" },
    ]);
    expect(placeCaptions(500, 600, measure).map((c) => c.text)).toEqual(["← Fell", "Rose →"]);
  });

  it("slides the short pair inside when even that does not fit", () => {
    const [left, right] = placeCaptions(30, 600, measure);
    expect(left).toEqual({ text: "← Fell", x: measure("← Fell"), anchor: "end" });
    expect(right).toEqual({ text: "Rose →", x: 40, anchor: "start" });
    expect(left.x - measure(left.text)).toBeCloseTo(0, 5);

    const [nearLeft, nearRight] = placeCaptions(580, 600, measure);
    expect(nearLeft).toEqual({ text: "← Fell", x: 570, anchor: "end" });
    expect(nearRight).toEqual({ text: "Rose →", x: 600 - measure("Rose →"), anchor: "start" });
    expect(nearRight.x + measure(nearRight.text)).toBeCloseTo(600, 5);
  });
});

describe("tickAnchor", () => {
  const text = "-30%";

  it("centers a label that fits and pins one that would cross an edge", () => {
    expect(tickAnchor(300, text, 600, measure)).toEqual({ x: 300, anchor: "middle" });
    expect(tickAnchor(5, text, 600, measure)).toEqual({ x: 0, anchor: "start" });
    expect(tickAnchor(595, text, 600, measure)).toEqual({ x: 600, anchor: "end" });
    expect(tickAnchor(20, text, 600, measure)).toEqual({ x: 20, anchor: "middle" });
  });
});
