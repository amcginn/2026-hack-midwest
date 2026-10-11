/**
 * NWS Alerts source adapter.
 * See docs/project-scope.md section 1 "Facility -> alert lookup pipeline".
 *
 * Pipeline (confirmed live during scoping):
 *   1. GET /points/{lat},{lon}  -> resolve county UGC zone
 *   2. GET /alerts/active?zone={countyUGC} -> active alerts for that zone
 *
 * NOTE: `point`-based alert lookup was confirmed to produce false
 * negatives (polygon-only coverage); zone-based lookup is used instead.
 */

import { scoreNwsAlert, type NwsSeverity, type NwsCertainty, type NwsUrgency } from "../evaluator/scoring";
import type { SourceOutcome } from "./types";

const USER_AGENT = "usda-facility-decisions-hackathon (contact: hackmidwest-demo)";
const NWS_BASE = "https://api.weather.gov";

interface NwsPointResponse {
  properties: {
    county: string; // full URL, e.g. https://api.weather.gov/zones/county/IAC045
    forecastZone: string;
  };
}

interface NwsAlertFeature {
  properties: {
    event: string;
    severity: string;
    certainty: string;
    urgency: string;
    headline: string;
    areaDesc: string;
    effective: string;
    "@id": string;
  };
}

interface NwsAlertsResponse {
  features: NwsAlertFeature[];
}

function extractZoneId(zoneUrl: string): string {
  // e.g. "https://api.weather.gov/zones/county/IAC045" -> "IAC045"
  const parts = zoneUrl.split("/");
  return parts[parts.length - 1];
}

async function resolveCountyZone(lat: number, lon: number): Promise<string> {
  const res = await fetch(`${NWS_BASE}/points/${lat},${lon}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`NWS /points lookup failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as NwsPointResponse;
  return extractZoneId(body.properties.county);
}

async function fetchActiveAlertsForZone(zoneId: string): Promise<NwsAlertFeature[]> {
  const res = await fetch(`${NWS_BASE}/alerts/active?zone=${zoneId}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`NWS /alerts/active lookup failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as NwsAlertsResponse;
  return body.features;
}

/**
 * Fetch and score all active NWS alerts for a facility's lat/lon.
 * Returns one SourceOutcome per active alert (a facility can have
 * multiple simultaneous alerts).
 */
export async function evaluateNwsAlerts(lat: number, lon: number): Promise<SourceOutcome[]> {
  const zoneId = await resolveCountyZone(lat, lon);
  const alerts = await fetchActiveAlertsForZone(zoneId);

  return alerts.map((alert): SourceOutcome => {
    const p = alert.properties;
    const result = scoreNwsAlert(
      p.severity as NwsSeverity,
      p.certainty as NwsCertainty,
      p.urgency as NwsUrgency,
    );

    return {
      source: "NWS",
      tier: "government",
      signal: p.event,
      status: result.status,
      postureScore: result.postureScore,
      weight: 1.0,
      detail: {
        severity: p.severity,
        certainty: p.certainty,
        urgency: p.urgency,
        headline: p.headline,
        areaDesc: p.areaDesc,
      },
      note: result.note,
      timestamp: p.effective,
      rawRef: p["@id"],
    };
  });
}
