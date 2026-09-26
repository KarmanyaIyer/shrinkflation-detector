// The backend numbers the "How this works" box states. The API does not expose them, so they
// are copied here, one place, each with the file it comes from. Change them together.
export const METHOD = {
  // backend/src/shrinkflation/sizes/service.py, ESCALATE_BELOW_CONFIDENCE
  escalateBelowConfidence: 0.6,
  // backend/src/shrinkflation/pipeline/detect.py, PUBLISH_MIN_CONFIDENCE
  publishMinConfidence: 0.7,
  // backend/src/shrinkflation/pipeline/detect.py, SIZE_NOISE_PCT
  sizeNoisePct: 0.5,
  // backend/src/shrinkflation/pipeline/detect.py, PRICE_NOISE_PCT
  priceNoisePct: 0.5,
  // backend/src/shrinkflation/pipeline/detect.py, SIZE_SUSPECT_PCT
  sizeSuspectPct: 80,
  // backend/src/shrinkflation/config.py, llm_daily_cost_cap_usd
  dailyModelBudgetUsd: 1.0,
  // backend/src/shrinkflation/config.py, ask_questions_per_visitor_per_day
  questionsPerVisitorPerDay: 10,
  // backend/src/shrinkflation/config.py, ask_max_tool_rounds
  maxToolRounds: 4,
  // infra/main.bicepparam, the default of REFRESH_CRON, "0 11 * * *" (the hour, in UTC). A deploy
  // that sets REFRESH_CRON to another hour must change this too.
  refreshHourUtc: 11,
} as const;

// "7 a.m." for 7, "1 p.m." for 13.
export function hourWord(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${h < 12 ? "a.m." : "p.m."}`;
}
