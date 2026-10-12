/**
 * Ported from server/src/evaluator/aggregate.ts. Posture is driven by
 * the max-scoring GOVERNMENT-tier source only -- see the server-side
 * module doc for the full "why not a blended average" history.
 */

import type { SourceOutcome } from "../sources/types";

export interface AggregateResult {
  recommendedScore?: number;
  drivingSource?: SourceOutcome;
  experimentalBlendedScore?: number;
  scoredSources: SourceOutcome[];
  excludedSources: SourceOutcome[];
}

export function aggregateSources(outcomes: SourceOutcome[]): AggregateResult {
  const scoredSources = outcomes.filter(
    (o): o is SourceOutcome & { postureScore: number } => o.status === "scored" && typeof o.postureScore === "number",
  );
  const excludedSources = outcomes.filter((o) => !scoredSources.includes(o as any));

  const governmentScored = scoredSources.filter((s) => s.tier === "government");

  let recommendedScore: number | undefined;
  let drivingSource: SourceOutcome | undefined;
  if (governmentScored.length > 0) {
    drivingSource = governmentScored.reduce((max, s) => ((s.postureScore ?? 0) > (max.postureScore ?? 0) ? s : max));
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
