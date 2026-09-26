import { describe, expect, it } from "vitest";
// The backend and infra sources, read as text, so a changed threshold fails here.
import configPy from "../../../backend/src/shrinkflation/config.py?raw";
import detectPy from "../../../backend/src/shrinkflation/pipeline/detect.py?raw";
import servicePy from "../../../backend/src/shrinkflation/sizes/service.py?raw";
import bicepparam from "../../../infra/main.bicepparam?raw";
import { METHOD, hourWord } from "./method";

// The number assigned to `name` in Python source: `NAME = 0.7`, `NAME = Decimal("0.5")` or
// `name: float = 1.00`.
function pyNumber(source: string, name: string): number {
  const match = source.match(new RegExp(`^\\s*${name}\\s*(?::\\s*\\w+\\s*)?=\\s*(?:Decimal\\(")?([\\d.]+)`, "m"));
  if (!match) throw new Error(`${name} not found`);
  return Number(match[1]);
}

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
  it("matches the backend's publish and reading thresholds", () => {
    expect(METHOD.publishMinConfidence).toBe(pyNumber(detectPy, "PUBLISH_MIN_CONFIDENCE"));
    expect(METHOD.sizeNoisePct).toBe(pyNumber(detectPy, "SIZE_NOISE_PCT"));
    expect(METHOD.priceNoisePct).toBe(pyNumber(detectPy, "PRICE_NOISE_PCT"));
    expect(METHOD.sizeSuspectPct).toBe(pyNumber(detectPy, "SIZE_SUSPECT_PCT"));
    expect(METHOD.escalateBelowConfidence).toBe(pyNumber(servicePy, "ESCALATE_BELOW_CONFIDENCE"));
  });

  it("matches the backend's limits", () => {
    expect(METHOD.dailyModelBudgetUsd).toBe(pyNumber(configPy, "llm_daily_cost_cap_usd"));
    expect(METHOD.questionsPerVisitorPerDay).toBe(pyNumber(configPy, "ask_questions_per_visitor_per_day"));
    expect(METHOD.maxToolRounds).toBe(pyNumber(configPy, "ask_max_tool_rounds"));
  });

  it("matches the default refresh hour in the deploy parameters", () => {
    // readEnvironmentVariable('REFRESH_CRON', '0 11 * * *'): minute, then hour.
    const cron = bicepparam.match(/REFRESH_CRON',\s*'(\d+) (\d+) /);
    expect(cron).not.toBeNull();
    expect(Number(cron![2])).toBe(METHOD.refreshHourUtc);
    expect(Number(cron![1])).toBe(0);
    expect(hourWord(METHOD.refreshHourUtc)).toBe("11 a.m.");
  });
});
