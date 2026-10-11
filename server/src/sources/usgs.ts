/**
 * USGS Water Services source adapter (gauge height).
 * See docs/project-scope.md section 1 for the data source findings.
 *
 * NOTE: USGS does not provide a flood-stage threshold itself -- the
 * caller must supply one (e.g. from a facility's configured reference,
 * or from the related NWS Flood Warning text). Without one, the
 * reading is surfaced as insufficient_data rather than guessed at.
 */

import { scoreUsgsGaugeHeight } from "../evaluator/usgsScoring";
import type { SourceOutcome } from "./types";

const USER_AGENT = "usda-facility-decisions-hackathon (contact: hackmidwest-demo)";
const USGS_BASE = "https://waterservices.usgs.gov/nwis/iv";
const REQUEST_TIMEOUT_MS = 8000;
const GAUGE_HEIGHT_PARAMETER_CODE = "00065"; // ft

interface UsgsTimeSeriesValue {
  value: string;
  dateTime: string;
}

interface UsgsResponse {
  value: {
    timeSeries: Array<{
      sourceInfo: { siteName: string };
      variable: { variableName: string; unit: { unitCode: string } };
      values: Array<{ value: UsgsTimeSeriesValue[] }>;
    }>;
  };
}

/**
 * Fetch the latest gauge height reading for a USGS site and score it
 * against an optional flood-stage reference.
 *
 * @param siteId USGS site number, e.g. "05420500" (Mississippi River at
 *               Clinton, IA)
 * @param floodStageFt optional reference flood stage in feet; if
 *               omitted, the reading is returned as insufficient_data
 */
export async function evaluateUsgsGaugeHeight(
  siteId: string,
  floodStageFt?: number,
): Promise<SourceOutcome> {
  const url = `${USGS_BASE}/?format=json&sites=${siteId}&parameterCd=${GAUGE_HEIGHT_PARAMETER_CODE}&siteStatus=all`;

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`USGS gauge lookup failed: ${res.status} ${res.statusText}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error("USGS gauge response returned malformed JSON");
  }

  const timeSeries = (body as Partial<UsgsResponse>)?.value?.timeSeries;
  if (!Array.isArray(timeSeries) || timeSeries.length === 0) {
    // No active gauge data for this site -- treat as absent, not an error.
    return {
      source: "USGS",
      tier: "supplemental",
      signal: `Gauge ${siteId}`,
      status: "absent",
      weight: 0.5,
      detail: { siteId },
      note: "No current gauge height data available for this site.",
      timestamp: new Date().toISOString(),
    };
  }

  const series = timeSeries[0];
  const values = series?.values?.[0]?.value;
  const latest = Array.isArray(values) && values.length > 0 ? values[values.length - 1] : undefined;

  if (!latest || typeof latest.value !== "string") {
    return {
      source: "USGS",
      tier: "supplemental",
      signal: `Gauge ${siteId}`,
      status: "absent",
      weight: 0.5,
      detail: { siteId },
      note: "No current gauge height reading available for this site.",
      timestamp: new Date().toISOString(),
    };
  }

  const gaugeHeightFt = Number(latest.value);
  if (Number.isNaN(gaugeHeightFt)) {
    return {
      source: "USGS",
      tier: "supplemental",
      signal: `Gauge ${siteId}`,
      status: "insufficient_data",
      weight: 0.5,
      detail: { siteId, rawValue: latest.value },
      note: "Gauge reading could not be parsed as a number; shown for awareness, not scored.",
      timestamp: latest.dateTime ?? new Date().toISOString(),
    };
  }

  const result = scoreUsgsGaugeHeight(gaugeHeightFt, floodStageFt);
  const siteName = series.sourceInfo?.siteName ?? siteId;

  return {
    source: "USGS",
    tier: "supplemental",
    signal: siteName,
    status: result.status,
    postureScore: result.postureScore,
    weight: 0.5,
    detail: {
      siteId,
      siteName,
      gaugeHeightFt,
      floodStageFt: floodStageFt ?? null,
      unit: "ft",
    },
    note: result.note,
    timestamp: latest.dateTime ?? new Date().toISOString(),
  };
}
