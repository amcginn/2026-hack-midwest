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

export type Posture = "normal" | "delay" | "early_dismissal" | "telework_unscheduled_leave" | "closure";

export function scoreToPosture(score: number): Posture {
  if (score < 0.5) return "normal";
  if (score < 1.5) return "delay";
  if (score < 2.5) return "early_dismissal";
  if (score < 3.5) return "telework_unscheduled_leave";
  return "closure";
}

export const POSTURE_LABELS: Record<Posture, string> = {
  normal: "Normal Operations",
  delay: "Delayed Arrival",
  early_dismissal: "Early Dismissal",
  telework_unscheduled_leave: "Telework / Unscheduled Leave",
  closure: "Closure",
};
