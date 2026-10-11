/**
 * USGS gauge-height scoring.
 * See docs/project-scope.md section 4 for the weighting model.
 *
 * USGS Water Services returns a raw gauge height (ft) with NO flood
 * stage threshold field of its own -- the flood stage reference value
 * must come from elsewhere (e.g. the related NWS Flood Warning's own
 * text, or a facility-specific configured reference). This adapter
 * takes the reference value as a parameter rather than fabricating or
 * hardcoding one from a different source.
 *
 * Conversion: ratio of (gauge height / flood stage), bucketed onto the
 * 0-4 posture scale. This is a simpler, more conservative mapping than
 * the NWS CAP-based formula (section 3) since USGS has no certainty/
 * urgency-equivalent fields to combine with.
 */

export interface UsgsScoreResult {
  status: "scored" | "insufficient_data";
  postureScore?: number;
  note?: string;
}

/**
 * Score a gauge height reading against a known flood stage reference.
 * If no flood stage reference is available for this gauge/facility,
 * returns insufficient_data rather than guessing a threshold.
 */
export function scoreUsgsGaugeHeight(
  gaugeHeightFt: number,
  floodStageFt: number | undefined,
): UsgsScoreResult {
  if (floodStageFt === undefined || floodStageFt <= 0) {
    return {
      status: "insufficient_data",
      note: "No flood stage reference configured for this gauge; reading shown for awareness, not scored.",
    };
  }

  const ratio = gaugeHeightFt / floodStageFt;

  // Below 60% of flood stage: normal.
  // 60-90%: delay-level concern (rising, worth watching).
  // 90-100%: early dismissal (approaching flood stage).
  // 100-110%: telework/unscheduled leave (at or just over flood stage).
  // 110%+: closure (well over flood stage).
  let postureScore: number;
  if (ratio < 0.6) postureScore = 0;
  else if (ratio < 0.9) postureScore = 1;
  else if (ratio < 1.0) postureScore = 2;
  else if (ratio < 1.1) postureScore = 3;
  else postureScore = 4;

  const percentOfFloodStage = Math.round(ratio * 100);
  const note =
    ratio < 1.0
      ? `Gauge at ${percentOfFloodStage}% of flood stage; below flood stage but monitor if rising.`
      : `Gauge at ${percentOfFloodStage}% of flood stage; at or above flood stage.`;

  return { status: "scored", postureScore, note };
}
