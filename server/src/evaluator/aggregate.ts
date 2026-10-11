/**
 * Cross-source aggregation. See docs/project-scope.md section 4
 * (original design) and the 2026-10-11 "cross-hazard aggregation"
 * finding for why this was simplified.
 *
 * FINDING (2026-10-11): the original weighted-average formula blends
 * scores across UNRELATED hazard dimensions (e.g. a tornado-risk score
 * of 4 and a flood-risk score of 0 averaging to 2), which is wrong --
 * a facility in real tornado danger isn't "half as urgent" because the
 * river happens to be calm. Correctly combining sources requires
 * knowing which hazard dimension each source speaks to (wind/storm vs.
 * flood vs. air quality) and only blending within a dimension when
 * sources genuinely corroborate the same hazard. We do not have that
 * classification built yet.
 *
 * SIMPLIFIED APPROACH (current): do not force a single blended score to
 * drive the recommendation. Instead:
 *   - `recommendedPosture` is driven by the single highest-scoring
 *     GOVERNMENT-tier source only (NWS is explicitly the primary/
 *     authoritative source per the challenge text and section 4).
 *   - Supplemental sources are still fetched, scored, and shown in full
 *     to the facility manager -- just not blended into the
 *     recommendation number. This matches the challenge's own framing:
 *     the system's job is to surface what's known, not to automate the
 *     decision.
 *   - The old weighted-average is still computed and returned as
 *     `experimentalBlendedScore` for reference/debugging, explicitly
 *     labeled as not authoritative, since it's known to be wrong across
 *     unrelated hazard dimensions.
 *
 * TODO (come back to this): tag each source with a hazard dimension
 * (e.g. "wind_storm" | "flood" | "air_quality") and only average
 * within a dimension; take the max across dimensions. Needs real
 * design time, not a quick fix -- see decision log 2026-10-11.
 */

import type { SourceOutcome } from "../sources/types";

export interface AggregateResult {
  /** Highest-scoring government-tier source's score, or undefined if
   * no government-tier source is currently scored. Drives the
   * recommendation -- see module doc above. */
  recommendedScore?: number;
  /** The source that produced recommendedScore, for rationale text. */
  drivingSource?: SourceOutcome;
  /** Old weighted-average across ALL scored sources, government and
   * supplemental alike. Known to be wrong across unrelated hazard
   * dimensions (see module doc) -- kept for reference only, NOT used
   * to pick the posture. */
  experimentalBlendedScore?: number;
  /** All sources that produced a numeric score (government + supplemental). */
  scoredSources: SourceOutcome[];
  /** Sources present but not contributing to any score (insufficient_data,
   * absent, narrative) -- still surfaced to the caller/UI. */
  excludedSources: SourceOutcome[];
}

export function aggregateSources(outcomes: SourceOutcome[]): AggregateResult {
  const scoredSources = outcomes.filter(
    (o): o is SourceOutcome & { postureScore: number } =>
      o.status === "scored" && typeof o.postureScore === "number",
  );
  const excludedSources = outcomes.filter((o) => !scoredSources.includes(o as any));

  const governmentScored = scoredSources.filter((s) => s.tier === "government");

  let recommendedScore: number | undefined;
  let drivingSource: SourceOutcome | undefined;
  if (governmentScored.length > 0) {
    drivingSource = governmentScored.reduce((max, s) =>
      (s.postureScore ?? 0) > (max.postureScore ?? 0) ? s : max,
    );
    recommendedScore = drivingSource.postureScore;
  }

  let experimentalBlendedScore: number | undefined;
  if (scoredSources.length > 0) {
    const weightedSum = scoredSources.reduce((sum, s) => sum + s.postureScore * s.weight, 0);
    const totalWeight = scoredSources.reduce((sum, s) => sum + s.weight, 0);
    experimentalBlendedScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : undefined;
  }

  return { recommendedScore, drivingSource, experimentalBlendedScore, scoredSources, excludedSources };
}
