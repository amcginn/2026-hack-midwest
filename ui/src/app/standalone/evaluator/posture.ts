/**
 * Ported from server/src/evaluator/posture.ts for the standalone
 * (GitHub Pages, no backend) build -- see docs/project-scope.md
 * section 6's "Self-contained client-only build" note for why this
 * exists as a port rather than a shared package. Logic is identical
 * to the server version; keep both in sync if either changes.
 */

export type Posture = "normal" | "delay" | "early_dismissal" | "telework_unscheduled_leave" | "closure" | "unknown";

export function scoreToPosture(score: number): Posture {
  if (score < 0.5) return "normal";
  if (score < 1.5) return "delay";
  if (score < 2.5) return "early_dismissal";
  if (score < 3.5) return "telework_unscheduled_leave";
  return "closure";
}

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
