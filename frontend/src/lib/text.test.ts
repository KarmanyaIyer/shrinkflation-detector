import { describe, expect, it } from "vitest";
import { balancedWrap, cleanName, displayName, joinProse, linkNames, proseName, wrapText } from "./text";

describe("names", () => {
  it("drops marks and promotional suffixes", () => {
    expect(cleanName("Kroger® Double Zipper Sandwich Bags BIG DEAL!")).toBe("Kroger Double Zipper Sandwich Bags");
    expect(displayName("Kroger® Bags™ ©2026 BIG DEAL!")).toBe("Kroger Bags 2026");
    expect(displayName("Khloud™ White Cheddar Protein Popcorn 4.0 oz")).toBe("Khloud White Cheddar Protein Popcorn 4.0 oz");
    expect(displayName("Kodiak(R) Protein-Packed Waffles(TM)")).toBe("Kodiak Protein-Packed Waffles");
  });

  it("settles shouted words and leaves short words and initialisms alone", () => {
    expect(displayName("General Mills® REESE'S™ PUFFS Chocolatey Peanut Butter Cereal")).toBe(
      "General Mills Reese's Puffs Chocolatey Peanut Butter Cereal",
    );
    expect(displayName("M&M'S Snickers & Twix Milk Chocolate Halloween Candy Bag")).toBe(
      "M&M's Snickers & Twix Milk Chocolate Halloween Candy Bag",
    );
    expect(displayName("REESE'S")).toBe("Reese's");
    expect(displayName("O'BRIEN")).toBe("O'Brien");
    expect(displayName("PROTEIN-PACKED")).toBe("Protein-Packed");
    expect(displayName("10CT")).toBe("10ct");
    expect(displayName("U.S.")).toBe("U.S.");
    expect(displayName("BBQ")).toBe("BBQ");
    expect(displayName("ONE Natural Dry Cat Food")).toBe("ONE Natural Dry Cat Food");
    expect(displayName("Lay's Classic Potato Chips")).toBe("Lay's Classic Potato Chips");
  });

  it("joins prose", () => {
    expect(joinProse(["a"])).toBe("a");
    expect(joinProse(["a", "b"])).toBe("a and b");
    expect(joinProse(["a", "b", "c"])).toBe("a, b and c");
  });
});

describe("proseName", () => {
  const reeses = "General Mills REESE'S PUFFS Chocolatey Peanut Butter Cereal";
  const waffles = "Kodiak® Protein-Packed Buttermilk and Vanilla Frozen Thick and Fluffy Power Waffles®";
  const bags = "Kroger® Double Zipper Sandwich Bags Extra Large 50 Count";

  it("calls a long name by its brand, spelled as the name spells it", () => {
    expect(proseName(reeses, "Reese's Puffs")).toBe("Reese's Puffs");
    expect(proseName("Kodiak® Honey Oat Protein Granola Family Size", "kodiak")).toBe("Kodiak");
    expect(proseName(bags, "Kroger", ["Bounty Paper Towels"])).toBe("Kroger");
  });

  it("keeps the full name when it is short or has no brand", () => {
    expect(proseName("Short name", "Short")).toBe("Short name");
    expect(proseName(reeses, null)).toBe(displayName(reeses));
    expect(proseName(reeses, undefined)).toBe(displayName(reeses));
    expect(proseName("Kodiak Honey Oat Granola", "Kodiak", [], 10)).toBe("Kodiak");
  });

  it("keeps the full name when the brand is not in the name as whole words", () => {
    expect(proseName(waffles, "Kodiak Cakes")).toBe(
      "Kodiak Protein-Packed Buttermilk and Vanilla Frozen Thick and Fluffy Power Waffles",
    );
    expect(proseName("Doves Chocolate Something Long Enough Name", "Dove")).toBe(
      "Doves Chocolate Something Long Enough Name",
    );
  });

  it("keeps the full name when another name carries the same brand", () => {
    expect(proseName(bags, "Kroger", ["Kroger® Paper Towels"])).toBe("Kroger Double Zipper Sandwich Bags Extra Large 50 Count");
    expect(proseName(reeses, "Reese's Puffs", ["REESE'S PUFFS Treats"])).toBe(displayName(reeses));
  });
});

describe("wrapping", () => {
  const measure = (text: string) => text.length * 7;
  const text = "General Mills Reese's Puffs Chocolatey Peanut Butter Cereal";

  it("breaks between words and only lets a single word exceed the width", () => {
    expect(wrapText(text, 170, measure)).toEqual(["General Mills Reese's", "Puffs Chocolatey Peanut", "Butter Cereal"]);
    for (const line of wrapText(text, 170, measure)) expect(measure(line)).toBeLessThanOrEqual(170);
    expect(wrapText("Supercalifragilistic tiny", 50, measure)).toEqual(["Supercalifragilistic", "tiny"]);
    expect(wrapText("  spaced   out  ", 1000, measure)).toEqual(["spaced out"]);
    expect(wrapText("", 100, measure)).toEqual([]);
  });

  it("evens the lines without adding one", () => {
    expect(balancedWrap(text, 170, measure)).toEqual(["General Mills Reese's", "Puffs Chocolatey", "Peanut Butter Cereal"]);
    for (const max of [120, 170, 200, 250, 300]) {
      const plain = wrapText(text, max, measure);
      const even = balancedWrap(text, max, measure);
      expect(even.length).toBe(plain.length);
      expect(even.join(" ")).toBe(text);
      expect(Math.max(...even.map(measure))).toBeLessThanOrEqual(Math.max(...plain.map(measure)));
    }
    expect(balancedWrap("one line", 1000, measure)).toEqual(["one line"]);
  });
});

describe("linkNames", () => {
  const products = [
    { id: "1", name: "Huggies® Simply Clean® Unscented Baby Wipes" },
    { id: "2", name: "Dove ® Shampoo Conditioner Intensive Repair" },
  ];

  it("marks the first loose occurrence of each name", () => {
    const runs = linkNames("Huggies Simply Clean Unscented Baby Wipes: 192 ct to 56 ct. Dove Shampoo Conditioner Intensive Repair too.", products);
    expect(runs).toEqual([
      { text: "Huggies Simply Clean Unscented Baby Wipes", productId: "1" },
      { text: ": 192 ct to 56 ct. " },
      { text: "Dove Shampoo Conditioner Intensive Repair", productId: "2" },
      { text: " too." },
    ]);
  });

  it("leaves text alone when nothing matches", () => {
    expect(linkNames("Nothing here.", products)).toEqual([{ text: "Nothing here." }]);
    expect(linkNames("", products)).toEqual([]);
  });
});
