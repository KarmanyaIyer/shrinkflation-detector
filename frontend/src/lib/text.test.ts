import { describe, expect, it } from "vitest";
import { cleanName, displayName, joinProse, linkNames, shortName } from "./text";

describe("names", () => {
  it("cleans marks and shouting", () => {
    expect(cleanName("Kroger® Double Zipper Sandwich Bags BIG DEAL!")).toBe("Kroger Double Zipper Sandwich Bags");
    expect(shortName("General Mills® REESE'S™ PUFFS Chocolatey Peanut Butter Cereal")).toBe("General Mills Reese's Puffs…");
    expect(displayName("General Mills® REESE'S™ PUFFS Chocolatey Peanut Butter Cereal")).toBe(
      "General Mills Reese's Puffs Chocolatey Peanut Butter Cereal",
    );
    expect(shortName("Khloud™ White Cheddar Protein Popcorn 4.0 oz")).toBe("Khloud White Cheddar Protein…");
    expect(shortName("Lay's Classic Potato Chips")).toBe("Lay's Classic Potato Chips");
    expect(shortName("ONE Natural Dry Cat Food")).toBe("ONE Natural Dry Cat Food");
  });

  it("joins prose", () => {
    expect(joinProse(["a"])).toBe("a");
    expect(joinProse(["a", "b"])).toBe("a and b");
    expect(joinProse(["a", "b", "c"])).toBe("a, b and c");
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
