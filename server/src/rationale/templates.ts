/**
 * Templated rationale/notification text. See docs/project-scope.md
 * section 5 -- deliberately templated, not LLM-generated, since the
 * combination space (posture band x driving source) is small and
 * finite (decision log, 2026-10-11).
 */

import type { SourceOutcome } from "../sources/types";
import { POSTURE_LABELS, type Posture } from "../evaluator/posture";

/**
 * Build the one-paragraph plain-language rationale for a facility's
 * evaluation result, per the challenge's "paste into an email" deliverable.
 *
 * Driven by the single highest government-tier source only -- see
 * evaluator/aggregate.ts module doc (2026-10-11) for why we stopped
 * blending across unrelated hazard dimensions. Supplemental sources are
 * mentioned as separate, informational context, not blended into the
 * posture number.
 */
export function buildRationale(
  facilityName: string,
  posture: Posture,
  drivingSource: SourceOutcome | undefined,
  supplementalScoredSources: SourceOutcome[],
  governmentSourceErrored = false,
): string {
  if (governmentSourceErrored) {
    return `The primary government hazard data source (NWS) could not be reached for ${facilityName}. Current conditions are **UNKNOWN** — this is not a confirmed "all clear" and should not be treated as normal operations. Please verify conditions manually (e.g. weather.gov) before making a decision, and retry this system shortly.`;
  }

  if (!drivingSource) {
    return `NWS was checked for ${facilityName} and has no active alert for this area right now. **Normal Operations** are recommended, but "no alert issued" is not the same as NWS actively certifying conditions are safe — continue monitoring, and review the supplemental readings below for additional context.`;
  }

  const postureLabel = POSTURE_LABELS[posture];
  const driverDescription = describeSource(drivingSource);
  const supplementalCount = supplementalScoredSources.length;
  const supplementalText =
    supplementalCount > 0
      ? ` ${supplementalCount} supplemental data source${supplementalCount > 1 ? "s" : ""} ${supplementalCount > 1 ? "are" : "is"} also available below for additional context (shown separately, not blended into this recommendation).`
      : "";

  return (
    `${facilityName} is recommended for **${postureLabel}** based on ${driverDescription}. ` +
    `${drivingSource.note ?? ""}${supplementalText}`.trim()
  );
}

function describeSource(outcome: SourceOutcome): string {
  if (outcome.source === "NWS") {
    const severity = outcome.detail.severity ?? "unknown severity";
    const certainty = outcome.detail.certainty ?? "unknown certainty";
    return `a ${outcome.signal} (${severity}, ${certainty})`;
  }
  return `${outcome.source} data (${outcome.signal})`;
}
