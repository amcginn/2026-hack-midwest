/**
 * Ported from server/src/sources/usgs.ts. No User-Agent header -- see
 * nws.ts port's module doc for why.
 */

import { scoreByFloodCategory, scoreByThresholds, type GaugeFloodThresholds } from "../evaluator/usgsScoring";
import type { SourceOutcome } from "./types";
import type { SupplementalAdapter } from "./supplementalAdapter";

const NWPS_BASE = "https://api.water.noaa.gov/nwps/v1/gauges";
const REQUEST_TIMEOUT_MS = 8000;

interface NwpsGaugeResponse {
  lid: string;
  usgsId?: string;
  name: string;
  status?: {
    observed?: { primary: number; primaryUnit: string; floodCategory?: string; validTime?: string };
  };
  flood?: {
    categories?: { action?: { stage: number }; minor?: { stage: number }; moderate?: { stage: number }; major?: { stage: number } };
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

export async function evaluateUsgsGaugeHeight(identifier: string): Promise<SourceOutcome> {
  const res = await fetch(`${NWPS_BASE}/${identifier.toLowerCase()}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    if (res.status === 404 || res.status === 503) {
      return {
        source: "USGS/NWPS",
        tier: "supplemental",
        signal: `Gauge ${identifier}`,
        status: "absent",
        weight: 0.5,
        detail: { identifier },
        note: "No current gauge data available for this identifier.",
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
      signal: data?.name ?? `Gauge ${identifier}`,
      status: "absent",
      weight: 0.5,
      detail: { identifier },
      note: "No current observed reading available for this gauge.",
      timestamp: new Date().toISOString(),
    };
  }

  const thresholds = extractThresholds(data as NwpsGaugeResponse);

  const result = observed.floodCategory !== undefined ? scoreByFloodCategory(observed.floodCategory) : scoreByThresholds(observed.primary, thresholds);

  return {
    source: "USGS/NWPS",
    tier: "supplemental",
    signal: data.name ?? `Gauge ${identifier}`,
    status: result.status,
    postureScore: result.postureScore,
    weight: 0.5,
    detail: {
      lid: data.lid ?? identifier,
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

export const usgsAdapter: SupplementalAdapter = {
  name: "USGS/NWPS",
  isApplicable: (facility) => Boolean(facility.riverGaugeId),
  evaluate: async (facility) => {
    if (!facility.riverGaugeId) return [];
    const outcome = await evaluateUsgsGaugeHeight(facility.riverGaugeId);
    return [outcome];
  },
};
