/**
 * Deliverable #2's explicitly-named fields that were designed in
 * section 5 of docs/project-scope.md but lost during the max-of-
 * government-tier aggregation rewrite (never a conscious cut --
 * tracked as a regression in section 7's gap tracker until this file).
 *
 *   "Which threshold was crossed and by how much"  -> thresholdCrossed
 *   "Confidence"                                   -> confidence
 *   "what would change the recommendation"         -> whatWouldChange
 *
 * All three are derived from the SAME driving source that already
 * powers the rationale paragraph (evaluator/aggregate.ts's
 * `drivingSource`) -- no new scoring logic, just explaining the
 * existing score in the specific terms the challenge asks for.
 */

import type { SourceOutcome } from "../sources/types";
import { POSTURE_BANDS, POSTURE_LABELS, type Posture } from "./posture";
import type { NwsCertainty } from "./scoring";

/** Plain-language confidence label, directly derived from the CAP
 * `certainty` field already used in the scoring formula (section 3) --
 * same defensibility anchor, not a separate invented scale. Mirrors
 * the original section 5 design's `"high (certainty=Observed)"`
 * pattern. */
const CERTAINTY_CONFIDENCE: Record<Exclude<NwsCertainty, "Unknown">, string> = {
  Observed: "High",
  Likely: "High",
  Possible: "Moderate",
  Unlikely: "Low",
};

export interface ExplanationFields {
  thresholdCrossed: string;
  confidence: string;
  whatWouldChange: string;
}

/**
 * Build the three explanation fields for a given evaluation outcome.
 * `score`/`posture` are the ALREADY-COMPUTED values from
 * evaluator/aggregate.ts + evaluator/posture.ts -- this function only
 * explains them in the challenge's specific terms, it does not
 * recompute anything.
 */
export function buildExplanation(
  posture: Posture,
  score: number | undefined,
  drivingSource: SourceOutcome | undefined,
  governmentSourceErrored: boolean,
): ExplanationFields {
  if (governmentSourceErrored) {
    return {
      thresholdCrossed: "Not applicable — the primary government source (NWS) could not be reached, so no score could be computed.",
      confidence: "None — recommendation cannot be trusted until NWS is reachable again.",
      whatWouldChange: "A successful NWS response on the next check will allow a real score and recommendation to be computed.",
    };
  }

  if (!drivingSource || score === undefined) {
    return {
      thresholdCrossed: "No threshold crossed — no active government-source alert is currently on record for this facility.",
      confidence: "N/A — there is nothing active to be confident or uncertain about.",
      whatWouldChange: "A new NWS Watch or Warning for this facility's area would introduce a score and move the recommendation off Normal Operations.",
    };
  }

  const band = POSTURE_BANDS[posture];
  const rangeText = band.upper !== null ? `${band.lower}–${band.upper}` : `${band.lower}+`;
  const thresholdCrossed = `Score of ${score} crossed into the ${POSTURE_LABELS[posture]} band (${rangeText}).`;

  const certainty = drivingSource.detail?.["certainty"] as NwsCertainty | undefined;
  const confidence =
    certainty && certainty !== "Unknown" && CERTAINTY_CONFIDENCE[certainty]
      ? `${CERTAINTY_CONFIDENCE[certainty]} (NWS certainty: ${certainty})`
      : "Unspecified — this alert did not carry a standard certainty value.";

  const whatWouldChange = buildWhatWouldChange(posture, drivingSource, band);

  return { thresholdCrossed, confidence, whatWouldChange };
}

function buildWhatWouldChange(
  posture: Posture,
  drivingSource: SourceOutcome,
  band: { lower: number; upper: number | null },
): string {
  const signal = drivingSource.signal;
  const certainty = drivingSource.detail?.["certainty"];

  const downgradeClause =
    certainty === "Observed" || certainty === "Likely"
      ? `If the ${signal} is downgraded, cancelled, or its certainty drops`
      : `If the ${signal} is upgraded or its certainty increases`;

  if (posture === "closure") {
    // Already at the top of the ladder -- nothing can push it higher;
    // only a downgrade is a meaningful "what would change" answer.
    return `${downgradeClause}, the recommendation would fall below the Closure threshold (${band.lower}). An additional concurrent severe alert would not raise this further -- Closure is the top of the posture ladder.`;
  }

  if (band.upper !== null) {
    return `${downgradeClause}, the recommendation would fall to a lower posture band. A new or escalated alert pushing the score to ${band.upper} or above would raise it to the next band instead.`;
  }

  return `${downgradeClause}, the recommendation would fall to a lower posture band.`;
}
