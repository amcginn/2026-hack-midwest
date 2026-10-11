/**
 * River gauge scoring, sourced from NOAA's NWPS (National Water
 * Prediction Service) API, not raw USGS gauge height.
 * See docs/project-scope.md section 1/4 for the full finding.
 *
 * NWPS (`api.water.noaa.gov/nwps/v1/gauges/{lid}`) wraps the same
 * underlying USGS reading (confirmed: NWPS gauge CMMI4's `usgsId` is
 * `05420500`, the exact site we were already querying directly) but
 * additionally provides:
 *   - an NWS-computed `floodCategory` (categorical: no_flooding / action
 *     / minor / moderate / major) -- authoritative, no ratio math needed
 *   - the actual official flood-stage thresholds for the gauge (action/
 *     minor/moderate/major, in ft)
 *
 * Earlier version of this file used a flood-stage value (11.0 ft) taken
 * from an NWS Flood Warning's free text -- that text referenced a
 * DIFFERENT waterway ("Wapsipinicon River near De Witt"), not this
 * Mississippi River gauge. That was a real error, corrected here by
 * using NWPS's own thresholds for the specific gauge being queried.
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

/**
 * Preferred scoring path: use NWS's own computed flood category
 * directly. Authoritative, no derived math.
 */
export function scoreByFloodCategory(floodCategory: string | undefined): UsgsScoreResult {
  if (!floodCategory || !(floodCategory in FLOOD_CATEGORY_SCORE)) {
    return {
      status: "insufficient_data",
      note: "No NWS flood category available for this gauge; shown for awareness, not scored.",
    };
  }

  const category = floodCategory as FloodCategory;
  const postureScore = FLOOD_CATEGORY_SCORE[category];
  const note =
    category === "no_flooding"
      ? "NWS reports no flooding at this gauge."
      : `NWS flood category: ${category}.`;

  return { status: "scored", postureScore, note };
}

/**
 * Fallback scoring path: if floodCategory itself is missing but we
 * have the gauge's own official thresholds, compute a ratio-based
 * score directly against them instead of guessing a reference value.
 */
export function scoreByThresholds(
  gaugeHeightFt: number,
  thresholds: GaugeFloodThresholds | undefined,
): UsgsScoreResult {
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
