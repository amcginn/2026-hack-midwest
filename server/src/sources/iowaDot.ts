/**
 * Iowa DOT 511 winter road-conditions source adapter.
 * See evaluator/iowaDotScoring.ts for the scoring derivation and
 * docs/project-scope.md section 1 for the full data-source finding.
 *
 * Confirmed live, free, no key: ArcGIS FeatureServer spatial query,
 * returning road segments (polylines) within a radius of a point.
 * This is a per-STATE feed (Iowa only) -- see isApplicable below --
 * and only has meaningful live data during Iowa DOT's confirmed
 * active season (Oct 15 - Apr 15 per the service's own item metadata);
 * outside that window it may simply have no/stale records, which is
 * handled the same as "no segments found," not a special case.
 */

import { scoreWorstCondition } from "../evaluator/iowaDotScoring";
import type { SourceOutcome } from "./types";
import type { SupplementalAdapter } from "./supplementalAdapter";
import type { Facility } from "../repository/types";

const USER_AGENT = "usda-facility-decisions-hackathon (contact: hackmidwest-demo)";
const IOWA_DOT_QUERY_URL =
  "https://services.arcgis.com/8lRhdTsQyJpO52F1/arcgis/rest/services/511_IA_Road_Conditions_View/FeatureServer/0/query";
const REQUEST_TIMEOUT_MS = 8000;
const SEARCH_RADIUS_MILES = 10;

interface ArcGisFeature {
  attributes: {
    ROUTE?: string;
    LONG_NAME?: string;
    ROAD_CONDITION?: string;
    CARS_MSG_UPDATE_DATE?: number; // epoch ms, UTC
  };
}

interface ArcGisQueryResponse {
  features?: ArcGisFeature[];
  error?: { message?: string };
}

/**
 * Query Iowa DOT's ArcGIS FeatureServer for road segments within
 * SEARCH_RADIUS_MILES of a point, via the server's own spatial query
 * (geometry + distance + units params) rather than fetching the full
 * ~1000-segment statewide feed and filtering client-side -- confirmed
 * live this returns a handful of nearby segments directly.
 */
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
    headers: { "User-Agent": USER_AGENT },
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
    .map((f) => ({
      condition: f.attributes.ROAD_CONDITION as string,
      routeDescription: f.attributes.LONG_NAME as string,
    }));

  const result = scoreWorstCondition(conditions);

  // Most recent CARS_MSG_UPDATE_DATE among the segments we looked at,
  // if any -- falls back to our own clock if the feed had no segments
  // at all (nothing to report a source timestamp for).
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
    detail: {
      segmentsChecked: features.length,
      searchRadiusMiles: SEARCH_RADIUS_MILES,
    },
    note: result.note,
    timestamp: latestUpdateMs !== undefined ? new Date(latestUpdateMs).toISOString() : new Date().toISOString(),
  };
}

/**
 * SupplementalAdapter wrapper -- Iowa-only (the feed is a per-state
 * platform; other states' CARS511 instances exist but aren't wired up
 * -- see docs/project-scope.md section 1's "Other Potential Future
 * Inputs"). isApplicable checks the facility's address state, not
 * lat/lon proximity to Iowa's border, since the feed itself is scoped
 * to Iowa's own road network regardless of exact distance.
 */
export const iowaDotAdapter: SupplementalAdapter = {
  name: "IowaDOT",
  isApplicable: (facility: Facility) => facility.address.state === "IA",
  evaluate: async (facility: Facility) => {
    const outcome = await evaluateIowaDotConditions(facility.coordinates.lat, facility.coordinates.lon);
    return [outcome];
  },
};
