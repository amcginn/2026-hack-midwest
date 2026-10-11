/**
 * AQICN (World Air Quality Index Project) source adapter.
 * See docs/project-scope.md section 1 for the data source finding.
 *
 * Requires a free API token -- see AQICN_API_TOKEN in .env (gitignored,
 * never committed; see docs/project-scope.md "Credentials & Secrets").
 */

import { scoreAqi } from "../evaluator/aqicnScoring";
import type { SourceOutcome } from "./types";
import type { SupplementalAdapter } from "./supplementalAdapter";

const AQICN_BASE = "https://api.waqi.info/feed";
const REQUEST_TIMEOUT_MS = 8000;

interface AqicnResponse {
  status: string; // "ok" or "error"
  data?: {
    aqi: number;
    dominentpol?: string;
    city?: { name?: string; geo?: [number, number] };
    time?: { iso?: string };
  };
}

// AQICN's geo-lookup returns the single nearest station with no
// distance cutoff -- confirmed live: querying lat=0,lon=0 (middle of
// the Gulf of Guinea) returned a real station in South Africa, ~1600mi
// away, rather than "no station nearby." Reject matches farther than
// this from the requested point rather than silently attributing a
// distant station's air quality to our facility.
//
// Miles, not km -- USDA is a US agency with a US audience; the rest of
// the system already uses US customary units (river gauge height is
// in feet, not meters).
const MAX_STATION_DISTANCE_MI = 62; // ~100km

/** Haversine distance between two lat/lon points, in miles. */
function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R_MI = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Fetch and score the current AQI for a lat/lon via the nearest AQICN
 * monitoring station.
 */
export async function evaluateAqicn(lat: number, lon: number): Promise<SourceOutcome> {
  const token = process.env.AQICN_API_TOKEN;
  if (!token) {
    // Missing config is a server setup problem, not a "no data"
    // situation -- surfaced distinctly from insufficient_data so it's
    // not confused with a legitimate API response.
    return {
      source: "AQICN",
      tier: "supplemental",
      signal: "AQI",
      status: "insufficient_data",
      weight: 0.4,
      detail: {},
      note: "AQICN_API_TOKEN is not configured on the server.",
      timestamp: new Date().toISOString(),
    };
  }

  const res = await fetch(`${AQICN_BASE}/geo:${lat};${lon}/?token=${token}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`AQICN lookup failed: ${res.status} ${res.statusText}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error("AQICN response returned malformed JSON");
  }

  const data = body as Partial<AqicnResponse>;

  if (data.status !== "ok" || !data.data) {
    // AQICN returns status:"error" with a message for e.g. unknown
    // locations or rate limits -- treat as absent rather than throwing,
    // since this is a legitimate "no station nearby" outcome, not
    // necessarily a hard failure.
    return {
      source: "AQICN",
      tier: "supplemental",
      signal: "AQI",
      status: "absent",
      weight: 0.4,
      detail: { lat, lon },
      note: "No AQICN monitoring station data available for this location.",
      timestamp: new Date().toISOString(),
    };
  }

  const stationGeo = data.data.city?.geo;
  if (Array.isArray(stationGeo) && stationGeo.length === 2) {
    const distance = distanceMiles(lat, lon, stationGeo[0], stationGeo[1]);
    if (distance > MAX_STATION_DISTANCE_MI) {
      return {
        source: "AQICN",
        tier: "supplemental",
        signal: data.data.city?.name ?? "AQI",
        status: "absent",
        weight: 0.4,
        detail: { nearestStationDistanceMi: Math.round(distance) },
        note: `Nearest AQICN station is ${Math.round(distance)}mi away — too far to attribute to this facility.`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  const aqi = data.data.aqi;
  const result = scoreAqi(typeof aqi === "number" ? aqi : undefined);

  return {
    source: "AQICN",
    tier: "supplemental",
    signal: data.data.city?.name ?? "AQI",
    status: result.status,
    postureScore: result.postureScore,
    weight: 0.4,
    detail: {
      aqi,
      category: result.category ?? null,
      dominantPollutant: data.data.dominentpol ?? null,
    },
    note: result.note,
    timestamp: data.data.time?.iso ?? new Date().toISOString(),
  };
}

/**
 * SupplementalAdapter wrapper -- applicable to every facility (only
 * needs lat/lon, which every facility record has). See
 * supplementalAdapter.ts module doc for why this interface exists.
 */
export const aqicnAdapter: SupplementalAdapter = {
  name: "AQICN",
  isApplicable: () => true,
  evaluate: async (facility) => {
    const outcome = await evaluateAqicn(facility.coordinates.lat, facility.coordinates.lon);
    return [outcome];
  },
};
