/**
 * Ported from server/src/evaluator/iowaDotScoring.ts.
 */

export type IowaDotCondition = "Impassable" | "Travel Not Advised" | "Completely Covered" | "Partially Covered" | "Seasonal";

export interface IowaDotScoreResult {
  status: "scored" | "absent";
  postureScore?: number;
  note: string;
}

const CONDITION_SCORE: Record<IowaDotCondition, number> = {
  Impassable: 4,
  "Travel Not Advised": 3,
  "Completely Covered": 2,
  "Partially Covered": 1,
  Seasonal: 0,
};

export function scoreWorstCondition(conditions: Array<{ condition: string; routeDescription: string }>): IowaDotScoreResult {
  if (conditions.length === 0) {
    return {
      status: "absent",
      note: "No Iowa DOT road segments found within range of this facility.",
    };
  }

  let worst: { condition: IowaDotCondition; routeDescription: string; score: number } | undefined;
  for (const c of conditions) {
    if (!(c.condition in CONDITION_SCORE)) continue;
    const score = CONDITION_SCORE[c.condition as IowaDotCondition];
    if (!worst || score > worst.score) {
      worst = { condition: c.condition as IowaDotCondition, routeDescription: c.routeDescription, score };
    }
  }

  if (!worst || worst.score === 0) {
    return {
      status: "absent",
      note: "All nearby Iowa DOT road segments report normal seasonal conditions.",
    };
  }

  return {
    status: "scored",
    postureScore: worst.score,
    note: `${worst.condition} reported on ${worst.routeDescription}.`,
  };
}
