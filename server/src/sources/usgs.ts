/**
 * River gauge source adapter -- queries NOAA's NWPS API, not raw USGS.
 * See docs/project-scope.md section 1/4 for the full finding and
 * correction history (an earlier version used the wrong river's flood
 * stage; NWPS gives the correct, gauge-specific, NWS-authoritative
 * thresholds and flood category directly).
 *
 * Despite the file name (kept for the "USGS" external source label the
 * rest of the system still calls this), the actual live call is to
 * `api.water.noaa.gov/nwps/v1/gauges/{lid}` -- NWPS wraps the same
 * underlying USGS reading plus NWS's own flood-stage context.
 */

import { scoreByFloodCategory, scoreByThresholds, type GaugeFloodThresholds } from "../evaluator/usgsScoring";
import type { SourceOutcome } from "./types";

const USER_AGENT = "usda-facility-decisions-hackathon (contact: hackmidwest-demo)";
const NWPS_BASE = "https://api.water.noaa.gov/nwps/v1/gauges";
const REQUEST_TIMEOUT_MS = 8000;

interface NwpsGaugeResponse {
  lid: string;
  usgsId?: string;
  name: string;
  status?: {
    observed?: {
      primary: number;
      primaryUnit: string;
      floodCategory?: string;
      validTime?: string;
    };
  };
  flood?: {
    categories?: {
      action?: { stage: number };
      minor?: { stage: number };
      moderate?: { stage: number };
      major?: { stage: number };
    };
  };
}

function extractThresholds(body: NwpsGaugeResponse): GaugeFloodThresholds {
  const categories = body.flood?.categories;
  return {
    action: categories?.action?.stage,
    minor: categories?.minor?.stage,
    moderate: categories?.moderate?.stage,
    major: categories?.major?.stage,
  };
}

/**
 * Fetch and score the latest river gauge reading for an NWPS location
 * ID ("lid", e.g. "CMMI4" for Mississippi River at Camanche/Clinton, IA).
 */
export async function evaluateUsgsGaugeHeight(lid: string): Promise<SourceOutcome> {
  const res = await fetch(`${NWPS_BASE}/${lid.toLowerCase()}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    // NWPS returns a structured 404-equivalent for an unknown lid rather
    // than throwing a generic error -- treat as absent, not a hard failure,
    // since "this gauge doesn't exist" is a legitimate, expected outcome.
    if (res.status === 404 || res.status === 503) {
      return {
        source: "USGS/NWPS",
        tier: "supplemental",
        signal: `Gauge ${lid}`,
        status: "absent",
        weight: 0.5,
        detail: { lid },
        note: "No current gauge data available for this location ID.",
        timestamp: new Date().toISOString(),
      };
    }
    throw new Error(`NWPS gauge lookup failed: ${res.status} ${res.statusText}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error("NWPS gauge response returned malformed JSON");
  }

  const data = body as Partial<NwpsGaugeResponse>;
  const observed = data?.status?.observed;

  if (!observed || typeof observed.primary !== "number") {
    return {
      source: "USGS/NWPS",
      tier: "supplemental",
      signal: data?.name ?? `Gauge ${lid}`,
      status: "absent",
      weight: 0.5,
      detail: { lid },
      note: "No current observed reading available for this gauge.",
      timestamp: new Date().toISOString(),
    };
  }

  const thresholds = extractThresholds(data as NwpsGaugeResponse);

  // Prefer NWS's own computed flood category; fall back to our own
  // ratio-against-thresholds calculation if that field is missing.
  const result =
    observed.floodCategory !== undefined
      ? scoreByFloodCategory(observed.floodCategory)
      : scoreByThresholds(observed.primary, thresholds);

  return {
    source: "USGS/NWPS",
    tier: "supplemental",
    signal: data.name ?? `Gauge ${lid}`,
    status: result.status,
    postureScore: result.postureScore,
    weight: 0.5,
    detail: {
      lid,
      usgsId: data.usgsId ?? null,
      gaugeHeightFt: observed.primary,
      unit: observed.primaryUnit,
      floodCategory: observed.floodCategory ?? null,
      thresholds,
    },
    note: result.note,
    timestamp: observed.validTime ?? new Date().toISOString(),
  };
}
