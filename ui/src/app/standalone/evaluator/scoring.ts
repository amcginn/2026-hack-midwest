/**
 * Ported from server/src/evaluator/scoring.ts. NWS CAP-based scoring
 * formula: postureScore = clamp(severityBase * certaintyModifier, 0, 4).
 * See docs/project-scope.md section 3 for the full derivation.
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

export function scoreNwsAlert(severity: NwsSeverity, certainty: NwsCertainty, urgency: NwsUrgency): NwsScoreResult {
  const severityBase = SEVERITY_BASE[severity as Exclude<NwsSeverity, "Unknown">];
  const certaintyModifier = CERTAINTY_MODIFIER[certainty as Exclude<NwsCertainty, "Unknown">];

  if (severityBase === undefined || certaintyModifier === undefined) {
    return {
      status: "insufficient_data",
      note: "Alert active but lacks standard severity/certainty data; shown for awareness, not scored.",
    };
  }

  const rawScore = severityBase * certaintyModifier;
  const postureScore = Math.round(Math.min(4, Math.max(0, rawScore)) * 100) / 100;

  return {
    status: "scored",
    postureScore,
    note: URGENCY_NOTES[urgency] ?? URGENCY_NOTES.Unknown,
  };
}
