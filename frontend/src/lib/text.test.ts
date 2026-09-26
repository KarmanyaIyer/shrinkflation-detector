import { describe, expect, it } from "vitest";
import { balancedWrap, brandName, cleanName, displayName, joinProse, leadWords, linkNames, proseName, wrapText } from "./text";

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

  it("settles short words inside a shouted phrase and keeps them elsewhere", () => {
    expect(displayName("ARM & HAMMER Double Duty Clumping Cat Litter")).toBe("Arm & Hammer Double Duty Clumping Cat Litter");
    expect(displayName("DELUXE MIXED NUTS SALTED WITH SEA SALT - KROGER - 32 OZ")).toBe(
      "Deluxe Mixed Nuts Salted with Sea Salt - Kroger - 32 oz",
    );
    expect(displayName("FRUIT & CREAM VARIETY PACK NATURALLY FLAVORED INSTANT OATMEAL 8 PK - KROGER - 8.4 OZ")).toBe(
      "Fruit & Cream Variety Pack Naturally Flavored Instant Oatmeal 8 pk - Kroger - 8.4 oz",
    );
    expect(displayName("LIGHTLY SALTED MIXED NUTS LESS THAN 50% PEANUTS WITH SEA SALT")).toBe(
      "Lightly Salted Mixed Nuts Less than 50% Peanuts with Sea Salt",
    );
    expect(displayName("KROGER BBQ SAUCE XL")).toBe("Kroger BBQ Sauce XL");
    expect(displayName("HERSHEY'S Milk Chocolate XL Candy Bar")).toBe("Hershey's Milk Chocolate XL Candy Bar");
    expect(displayName("Suave Tropical Coconut Shampoo, 22.5 FL OZ")).toBe("Suave Tropical Coconut Shampoo, 22.5 fl oz");
    expect(displayName("Maggi Spicy Garlic Noodles 4PK")).toBe("Maggi Spicy Garlic Noodles 4pk");
    for (const kept of ["ACE Bakery Sourdough", "BIC Flex 5 Razors", "OGX Shampoo", "VO5 Shampoo", "Pantene Set, 72 HR Lush Moisture"]) {
      expect(displayName(kept)).toBe(kept);
    }
  });

  it("leaves number ranges as written, with no hidden characters", () => {
    const name = "Oscar Mayer Original Fully Cooked Bacon, Box, 9-11 slices";
    expect(displayName(name)).toBe(name);
    expect(displayName("5-Blade Razors")).toBe("5-Blade Razors");
  });

  it("lowers only size units after a number and keeps other letters after one", () => {
    expect(displayName("Crest 3D White Advanced Teeth Whitening Toothpaste")).toBe("Crest 3D White Advanced Teeth Whitening Toothpaste");
    expect(displayName("Pampers Complete Clean Fresh Scent 12X Baby Wipes")).toBe("Pampers Complete Clean Fresh Scent 12X Baby Wipes");
    expect(displayName("CRUNCHY 3D-PRINTED SNACK 4PK")).toBe("Crunchy 3D-Printed Snack 4pk");
    expect(displayName("GMCR KCUP CRML VAN CRM N 10CT")).toBe("GMCR Kcup CRML Van CRM N 10ct");
  });

  it("keeps capitals on long words with no vowel", () => {
    expect(displayName("Bibigo Sweet & Savory KBBQ Korean-Style Sauced Instant Ramyun Noodles")).toBe(
      "Bibigo Sweet & Savory KBBQ Korean-Style Sauced Instant Ramyun Noodles",
    );
    expect(displayName("HUGGIES SIMP CLN BABYWIPE RGD FLPTP 64")).toBe("Huggies Simp CLN Babywipe RGD FLPTP 64");
    expect(displayName("M&M'S Peanut")).toBe("M&M's Peanut");
  });

  it("joins prose", () => {
    expect(joinProse(["a"])).toBe("a");
    expect(joinProse(["a", "b"])).toBe("a and b");
    expect(joinProse(["a", "b", "c"])).toBe("a, b and c");
  });
});

describe("brandName", () => {
  it("spells the brand the way the displayed name does", () => {
    expect(brandName("BIC", "BIC Flex 5 Razors")).toBe("BIC");
    expect(brandName("DIGIORNO", "DIGIORNO Rising Crust Pepperoni Frozen Pizza")).toBe("Digiorno");
    expect(brandName("Khloud™", "Khloud™ White Cheddar Protein Popcorn 4.0 oz")).toBe("Khloud");
    expect(brandName("Reese's Puffs", "General Mills® REESE'S™ PUFFS Chocolatey Peanut Butter Cereal")).toBe("Reese's Puffs");
  });

  it("keeps the brand as listed, marks dropped, when the name does not contain it", () => {
    expect(brandName("Kodiak Cakes", "Kodiak® Protein-Packed Buttermilk Power Waffles®")).toBe("Kodiak Cakes");
    expect(brandName("OGX®", "Renewing Argan Oil of Morocco Shampoo")).toBe("OGX");
  });
});

describe("leadWords", () => {
  it("counts the brand words the name starts with, and at least one", () => {
    expect(leadWords("Kodiak Protein-Packed Buttermilk Power Waffles", "Kodiak Cakes")).toBe(1);
    expect(leadWords("Kodiak Cakes Power Cakes Buttermilk Mix", "Kodiak Cakes")).toBe(2);
    expect(leadWords("Tate’s Bake Shop Pumpkin Spice Cookies", "Tate's Bake Shop")).toBe(3);
    expect(leadWords("General Mills Reese's Puffs Cereal", "Reese's Puffs")).toBe(1);
    expect(leadWords("Plain Name", null)).toBe(1);
    expect(leadWords("Dove", "Dove")).toBe(1);
  });
});

describe("proseName", () => {
  const reeses = "General Mills REESE'S PUFFS Chocolatey Peanut Butter Cereal";
  const waffles = "Kodiak® Protein-Packed Buttermilk and Vanilla Frozen Thick and Fluffy Power Waffles®";
  const bags = "Kroger® Double Zipper Sandwich Bags Extra Large 50 Count";

  it("calls a long name by its brand, spelled as the name spells it", () => {
    expect(proseName(reeses, "Reese's Puffs")).toBe("Reese's Puffs");
    expect(proseName("Simple Truth Organic® Dark Color Maple Syrup Family Size", "simple truth organic")).toBe("Simple Truth Organic");
    expect(proseName("ARM & HAMMER Plus OxiClean with Odor Blasters Liquid Detergent", "Arm & Hammer", ["Bounty Paper Towels"])).toBe(
      "Arm & Hammer",
    );
  });

  it("keeps the full name when the brand is one word", () => {
    expect(proseName("Kodiak® Honey Oat Protein Granola Family Size", "kodiak")).toBe("Kodiak Honey Oat Protein Granola Family Size");
    expect(proseName(bags, "Kroger", ["Bounty Paper Towels"])).toBe("Kroger Double Zipper Sandwich Bags Extra Large 50 Count");
    expect(proseName("Dove Shampoo Conditioner Intensive Repair Twin Pack", "Dove")).toBe("Dove Shampoo Conditioner Intensive Repair Twin Pack");
  });

  it("keeps the full name when it is short or has no brand", () => {
    expect(proseName("Short name", "Short")).toBe("Short name");
    expect(proseName(reeses, null)).toBe(displayName(reeses));
    expect(proseName(reeses, undefined)).toBe(displayName(reeses));
    expect(proseName("Late July Mexican Street Corn Chips", "Late July", [], 10)).toBe("Late July");
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
