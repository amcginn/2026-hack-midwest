/**
 * AQI scoring, based on the official US EPA 2016 AQI standard.
 * See docs/project-scope.md section 1/4.
 *
 * Breakpoints confirmed directly from aqicn.org/scale/ (our actual data
 * provider, which explicitly states it implements the EPA 2016
 * standard) and cross-checked against airnow.gov/EPA's own AQI Basics
 * page -- same source scale as the system itself, no translation gap.
 *
 *   0-50    Good                              -> 0 (Normal)
 *   51-100  Moderate                          -> 1 (Delay)
 *   101-150 Unhealthy for Sensitive Groups    -> 2 (Early Dismissal)
 *   151-200 Unhealthy                         -> 3 (Telework/Unsched Leave)
 *   201-300 Very Unhealthy                    -> 4 (Closure)
 *   300+    Hazardous                         -> 4 (Closure)
 *
 * Note: EPA's scale has 6 categories; our posture ladder has 5 bands.
 * Very Unhealthy and Hazardous both map to Closure (4) -- defensible
 * since EPA's own health-implication language for both is already
 * emergency-level ("health warnings of emergency conditions" /
 * "health alert"), not a meaningfully different operational response.
 */

export interface AqiScoreResult {
  status: "scored" | "insufficient_data";
  postureScore?: number;
  category?: string;
  note?: string;
}

const AQI_BREAKPOINTS: Array<{ max: number; category: string; score: number }> = [
  { max: 50, category: "Good", score: 0 },
  { max: 100, category: "Moderate", score: 1 },
  { max: 150, category: "Unhealthy for Sensitive Groups", score: 2 },
  { max: 200, category: "Unhealthy", score: 3 },
  { max: 300, category: "Very Unhealthy", score: 4 },
  { max: Infinity, category: "Hazardous", score: 4 },
];

/**
 * Score a raw AQI value (0-500 scale) against the EPA breakpoints.
 */
export function scoreAqi(aqi: number | undefined): AqiScoreResult {
  if (aqi === undefined || Number.isNaN(aqi) || aqi < 0) {
    return {
      status: "insufficient_data",
      note: "No valid AQI reading available; shown for awareness, not scored.",
    };
  }

  const bracket = AQI_BREAKPOINTS.find((b) => aqi <= b.max);
  // AQI_BREAKPOINTS always has a final { max: Infinity } entry, so this
  // should never be undefined for a non-negative number -- defensive
  // fallback kept for clarity, not expected to trigger.
  if (!bracket) {
    return {
      status: "insufficient_data",
      note: "AQI value out of expected range; shown for awareness, not scored.",
    };
  }

  const note =
    bracket.score === 0
      ? "Air quality good; no action needed."
      : `Air quality ${bracket.category.toLowerCase()}; sensitive groups should limit prolonged outdoor exertion.`;

  return { status: "scored", postureScore: bracket.score, category: bracket.category, note };
}
