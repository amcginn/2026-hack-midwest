/**
 * Ported from server/src/evaluator/usgsScoring.ts.
 */

export type FloodCategory = "major" | "moderate" | "minor" | "action" | "no_flooding";

export interface GaugeFloodThresholds {
  action?: number;
  minor?: number;
  moderate?: number;
  major?: number;
}

export interface UsgsScoreResult {
  status: "scored" | "insufficient_data";
  postureScore?: number;
  note?: string;
}

const FLOOD_CATEGORY_SCORE: Record<FloodCategory, number> = {
  no_flooding: 0,
  action: 1,
  minor: 2,
  moderate: 3,
  major: 4,
};

export function scoreByFloodCategory(floodCategory: string | undefined): UsgsScoreResult {
  if (!floodCategory || !(floodCategory in FLOOD_CATEGORY_SCORE)) {
    return {
      status: "insufficient_data",
      note: "No NWS flood category available for this gauge; shown for awareness, not scored.",
    };
  }

  const category = floodCategory as FloodCategory;
  const postureScore = FLOOD_CATEGORY_SCORE[category];
  const note = category === "no_flooding" ? "NWS reports no flooding at this gauge." : `NWS flood category: ${category}.`;

  return { status: "scored", postureScore, note };
}

export function scoreByThresholds(gaugeHeightFt: number, thresholds: GaugeFloodThresholds | undefined): UsgsScoreResult {
  const actionStage = thresholds?.action;
  if (actionStage === undefined || actionStage <= 0) {
    return {
      status: "insufficient_data",
      note: "No flood-stage thresholds available for this gauge; reading shown for awareness, not scored.",
    };
  }

  if (thresholds?.major !== undefined && gaugeHeightFt >= thresholds.major) {
    return { status: "scored", postureScore: 4, note: `At or above major flood stage (${thresholds.major}ft).` };
  }
  if (thresholds?.moderate !== undefined && gaugeHeightFt >= thresholds.moderate) {
    return { status: "scored", postureScore: 3, note: `At or above moderate flood stage (${thresholds.moderate}ft).` };
  }
  if (thresholds?.minor !== undefined && gaugeHeightFt >= thresholds.minor) {
    return { status: "scored", postureScore: 2, note: `At or above minor flood stage (${thresholds.minor}ft).` };
  }
  if (gaugeHeightFt >= actionStage) {
    return { status: "scored", postureScore: 1, note: `At or above action stage (${actionStage}ft).` };
  }

  const percentOfAction = Math.round((gaugeHeightFt / actionStage) * 100);
  return {
    status: "scored",
    postureScore: 0,
    note: `Below action stage (${percentOfAction}% of ${actionStage}ft action threshold).`,
  };
}
