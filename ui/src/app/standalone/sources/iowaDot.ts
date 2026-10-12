/**
 * Ported from server/src/sources/iowaDot.ts. No User-Agent header --
 * see nws.ts port's module doc for why.
 */

import { scoreWorstCondition } from "../evaluator/iowaDotScoring";
import type { SourceOutcome } from "./types";
import type { SupplementalAdapter } from "./supplementalAdapter";
import type { Facility } from "../data/types";

const IOWA_DOT_QUERY_URL = "https://services.arcgis.com/8lRhdTsQyJpO52F1/arcgis/rest/services/511_IA_Road_Conditions_View/FeatureServer/0/query";
const REQUEST_TIMEOUT_MS = 8000;
const SEARCH_RADIUS_MILES = 10;

interface ArcGisFeature {
  attributes: { ROUTE?: string; LONG_NAME?: string; ROAD_CONDITION?: string; CARS_MSG_UPDATE_DATE?: number };
}

interface ArcGisQueryResponse {
  features?: ArcGisFeature[];
  error?: { message?: string };
}

export async function evaluateIowaDotConditions(lat: number, lon: number): Promise<SourceOutcome> {
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    distance: String(SEARCH_RADIUS_MILES),
    units: "esriSRUnit_StatuteMile",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "ROUTE,LONG_NAME,ROAD_CONDITION,CARS_MSG_UPDATE_DATE",
    f: "json",
  });

  const res = await fetch(`${IOWA_DOT_QUERY_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Iowa DOT road-conditions query failed: ${res.status} ${res.statusText}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error("Iowa DOT road-conditions response returned malformed JSON");
  }

  const data = body as ArcGisQueryResponse;
  if (data.error) {
    throw new Error(`Iowa DOT road-conditions query error: ${data.error.message ?? "unknown error"}`);
  }

  const features = data.features ?? [];
  const conditions = features
    .filter((f) => typeof f.attributes.ROAD_CONDITION === "string" && typeof f.attributes.LONG_NAME === "string")
    .map((f) => ({ condition: f.attributes.ROAD_CONDITION as string, routeDescription: f.attributes.LONG_NAME as string }));

  const result = scoreWorstCondition(conditions);

  const latestUpdateMs = features.reduce<number | undefined>((latest, f) => {
    const ts = f.attributes.CARS_MSG_UPDATE_DATE;
    if (typeof ts !== "number") return latest;
    return latest === undefined || ts > latest ? ts : latest;
  }, undefined);

  return {
    source: "IowaDOT",
    tier: "supplemental",
    signal: "Road Conditions",
    status: result.status,
    postureScore: result.postureScore,
    weight: 0.4,
    detail: { segmentsChecked: features.length, searchRadiusMiles: SEARCH_RADIUS_MILES },
    note: result.note,
    timestamp: latestUpdateMs !== undefined ? new Date(latestUpdateMs).toISOString() : new Date().toISOString(),
  };
}

export const iowaDotAdapter: SupplementalAdapter = {
  name: "IowaDOT",
  isApplicable: (facility: Facility) => facility.address.state === "IA",
  evaluate: async (facility: Facility) => {
    const outcome = await evaluateIowaDotConditions(facility.coordinates.lat, facility.coordinates.lon);
    return [outcome];
  },
};
