import { describe, expect, it } from "vitest";
import { METHOD, hourWord } from "./method";

describe("hourWord", () => {
  it("writes an hour of the day in twelve-hour form", () => {
    expect(hourWord(11)).toBe("11 a.m.");
    expect(hourWord(7)).toBe("7 a.m.");
    expect(hourWord(0)).toBe("12 a.m.");
    expect(hourWord(12)).toBe("12 p.m.");
    expect(hourWord(13)).toBe("1 p.m.");
    expect(hourWord(23)).toBe("11 p.m.");
  });

  it("wraps hours outside 0 to 23", () => {
    expect(hourWord(-1)).toBe("11 p.m.");
    expect(hourWord(24)).toBe("12 a.m.");
    expect(hourWord(25)).toBe("1 a.m.");
  });
});

describe("METHOD", () => {
  it("holds the documented backend numbers", () => {
    expect(METHOD).toEqual({
      escalateBelowConfidence: 0.6,
      publishMinConfidence: 0.7,
      sizeNoisePct: 0.5,
      priceNoisePct: 0.5,
      sizeSuspectPct: 80,
      dailyModelBudgetUsd: 1.0,
      questionsPerVisitorPerDay: 10,
      maxToolRounds: 4,
      refreshHourUtc: 11,
    });
    expect(hourWord(METHOD.refreshHourUtc)).toBe("11 a.m.");
  });
});
