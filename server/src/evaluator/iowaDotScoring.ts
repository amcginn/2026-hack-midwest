/**
 * Iowa DOT 511 winter road-conditions scoring.
 * See docs/project-scope.md section 1 for the full finding and
 * data/fixtures/ia-dot-road-condition-legend.yaml for the confirmed
 * legend derivation.
 *
 * Source: `511_IA_Road_Conditions_View` ArcGIS FeatureServer (free, no
 * key), confirmed live. The STRING `ROAD_CONDITION` field is used for
 * scoring, not the numeric `ROAD_CONDITION_CODE` -- the code-to-string
 * pairing was only independently confirmed for `Seasonal=10`; scoring
 * off the string sidesteps that gap entirely (same decision already
 * recorded in section 1's Open Questions).
 *
 * Legend confirmed via the service's own map renderer
 * (`drawingInfo.renderer.uniqueValueInfos`), ordered worst-to-normal by
 * the map's red->green symbology convention:
 *   Impassable > Travel Not Advised > Completely Covered >
 *   Partially Covered > Seasonal (normal baseline)
 *
 * This is a polyline-segment feed (one record per road segment), not a
 * single point reading like the river gauge -- there's no single
 * "the facility's road condition." The adapter queries a radius around
 * the facility and this module scores the WORST condition found among
 * nearby segments, consistent with the challenge's "state DOT road
 * conditions" supplementary-signal framing.
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

/**
 * Score the WORST road condition among a set of nearby segments.
 * "Seasonal" (normal baseline) segments are not scored as 0 -- per
 * section 2's "absence is not evidence of normalcy" rule, a baseline
 * reading is `absent`/excluded, not a positive zero score, consistent
 * with how Iowa DOT's own "Seasonal" value was already treated when
 * found during scoping.
 */
export function scoreWorstCondition(
  conditions: Array<{ condition: string; routeDescription: string }>,
): IowaDotScoreResult {
  if (conditions.length === 0) {
    return {
      status: "absent",
      note: "No Iowa DOT road segments found within range of this facility.",
    };
  }

  let worst: { condition: IowaDotCondition; routeDescription: string; score: number } | undefined;
  for (const c of conditions) {
    if (!(c.condition in CONDITION_SCORE)) continue; // unrecognized value -- skip, don't guess
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
