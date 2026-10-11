/**
 * Posture ladder bucket mapping. See docs/project-scope.md section 4.
 *
 *   0.0-0.5  normal
 *   0.5-1.5  delay
 *   1.5-2.5  early_dismissal
 *   2.5-3.5  telework_unscheduled_leave
 *   3.5+     closure
 *
 * Boundaries were checked against real fixture-validated scores
 * (section 4 decision log, 2026-10-11) and kept as-is -- no evidence
 * from real data that they need adjusting.
 */

export type Posture =
  | "normal"
  | "delay"
  | "early_dismissal"
  | "telework_unscheduled_leave"
  | "closure"
  | "unknown";

export function scoreToPosture(score: number): Posture {
  if (score < 0.5) return "normal";
  if (score < 1.5) return "delay";
  if (score < 2.5) return "early_dismissal";
  if (score < 3.5) return "telework_unscheduled_leave";
  return "closure";
}

/**
 * The numeric [lower, upper) bounds for each posture band, exposed
 * separately from scoreToPosture so callers (see
 * evaluator/explain.ts's thresholdCrossed) can cite the exact range a
 * score fell into, not just the resulting label. `closure` has no
 * upper bound (capped at 4 by the scoring formula itself, see
 * evaluator/scoring.ts).
 */
export const POSTURE_BANDS: Record<Posture, { lower: number; upper: number | null }> = {
  normal: { lower: 0, upper: 0.5 },
  delay: { lower: 0.5, upper: 1.5 },
  early_dismissal: { lower: 1.5, upper: 2.5 },
  telework_unscheduled_leave: { lower: 2.5, upper: 3.5 },
  closure: { lower: 3.5, upper: null },
  unknown: { lower: 0, upper: null },
};

export const POSTURE_LABELS: Record<Posture, string> = {
  normal: "Normal Operations",
  delay: "Delayed Arrival",
  early_dismissal: "Early Dismissal",
  telework_unscheduled_leave: "Telework / Unscheduled Leave",
  closure: "Closure",
  unknown: "Status Unknown — Verify Manually",
};
