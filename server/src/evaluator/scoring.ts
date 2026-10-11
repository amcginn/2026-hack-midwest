/**
 * NWS CAP-based scoring formula.
 * See docs/project-scope.md section 3 "Resolved Design -- NWS scoring
 * formula" for the full derivation and fixture validation.
 *
 *   postureScore = clamp(severityBase * certaintyModifier, 0, 4)
 *
 * Urgency intentionally does NOT rescale the score -- it drives the
 * `note`/rationale text instead (see urgencyNote below).
 */

export type NwsSeverity = "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown";
export type NwsCertainty = "Observed" | "Likely" | "Possible" | "Unlikely" | "Unknown";
export type NwsUrgency = "Immediate" | "Expected" | "Future" | "Past" | "Unknown";

const SEVERITY_BASE: Record<Exclude<NwsSeverity, "Unknown">, number> = {
  Extreme: 4,
  Severe: 3,
  Moderate: 2,
  Minor: 1,
};

const CERTAINTY_MODIFIER: Record<Exclude<NwsCertainty, "Unknown">, number> = {
  Observed: 1.0,
  Likely: 0.85,
  Possible: 0.5,
  Unlikely: 0.1,
};

const URGENCY_NOTES: Record<NwsUrgency, string> = {
  Immediate: "Take responsive action immediately.",
  Expected: "Action expected to be needed soon (within the next hour).",
  Future: "Worth evaluating for the day and may adjust guidance later, but not an immediate trigger.",
  Past: "Responsive action is no longer required for this alert.",
  Unknown: "Timing of required action is not specified.",
};

export interface NwsScoreResult {
  status: "scored" | "insufficient_data";
  postureScore?: number;
  note?: string;
}

/**
 * Score a single NWS alert's severity/certainty/urgency triple.
 * Returns status "insufficient_data" if severity or certainty is
 * "Unknown" -- this is the case confirmed live for e.g. Air Quality
 * Alert, which returns Unknown/Unknown/Unknown (section 1 findings).
 */
export function scoreNwsAlert(
  severity: NwsSeverity,
  certainty: NwsCertainty,
  urgency: NwsUrgency,
): NwsScoreResult {
  const severityBase = SEVERITY_BASE[severity as Exclude<NwsSeverity, "Unknown">];
  const certaintyModifier = CERTAINTY_MODIFIER[certainty as Exclude<NwsCertainty, "Unknown">];

  // Treat "Unknown" OR any value outside our known enum (e.g. a future
  // CAP extension NWS might add) as insufficient_data rather than
  // silently producing NaN. Confirmed via testing that an unrecognized
  // string value previously fell through to a NaN postureScore.
  if (severityBase === undefined || certaintyModifier === undefined) {
    return {
      status: "insufficient_data",
      note: "Alert active but lacks standard severity/certainty data; shown for awareness, not scored.",
    };
  }

  const rawScore = severityBase * certaintyModifier;
  // Round to 2 decimal places to avoid floating-point noise
  // (e.g. 3 * 0.1 producing 0.30000000000000004) leaking into the UI
  // or decision records.
  const postureScore = Math.round(Math.min(4, Math.max(0, rawScore)) * 100) / 100;

  return {
    status: "scored",
    postureScore,
    note: URGENCY_NOTES[urgency] ?? URGENCY_NOTES.Unknown,
  };
}
