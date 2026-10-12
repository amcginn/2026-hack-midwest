/**
 * Ported from server/src/sources/nws.ts for the browser-direct
 * standalone build. The only real change from the server version:
 * no `User-Agent` header -- browsers forbid scripts from setting it
 * (one of the Fetch spec's "forbidden request headers"), and NWS
 * doesn't actually require a specific value to respond (confirmed
 * live with a plain curl request carrying curl's own default UA, no
 * special header, 2026-10-12).
 */

import { scoreNwsAlert, type NwsSeverity, type NwsCertainty, type NwsUrgency } from "../evaluator/scoring";
import type { SourceOutcome } from "./types";

const NWS_BASE = "https://api.weather.gov";
const REQUEST_TIMEOUT_MS = 8000;

interface NwsPointResponse {
  properties: { county: string; forecastZone: string };
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
    onset?: string;
    expires?: string;
    ends?: string;
    description?: string;
    instruction?: string;
    "@id": string;
  };
}

interface NwsAlertsResponse {
  features: NwsAlertFeature[];
}

function extractZoneId(zoneUrl: string): string {
  const parts = zoneUrl.split("/");
  return parts[parts.length - 1];
}

async function resolveCountyZone(lat: number, lon: number): Promise<string> {
  const res = await fetch(`${NWS_BASE}/points/${lat},${lon}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`NWS /points lookup failed: ${res.status} ${res.statusText}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error("NWS /points returned malformed JSON");
  }

  const county = (body as Partial<NwsPointResponse>)?.properties?.county;
  if (typeof county !== "string" || county.length === 0) {
    throw new Error("NWS /points response missing expected properties.county field");
  }

  return extractZoneId(county);
}

async function fetchActiveAlertsForZone(zoneId: string): Promise<NwsAlertFeature[]> {
  const res = await fetch(`${NWS_BASE}/alerts/active?zone=${zoneId}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`NWS /alerts/active lookup failed: ${res.status} ${res.statusText}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error("NWS /alerts/active returned malformed JSON");
  }

  const features = (body as Partial<NwsAlertsResponse>)?.features;
  if (!Array.isArray(features)) {
    throw new Error("NWS /alerts/active response missing expected features array");
  }

  return features;
}

function collapseByHeadline(outcomes: SourceOutcome[]): SourceOutcome[] {
  const groups = new Map<string, SourceOutcome[]>();
  const ungrouped: SourceOutcome[] = [];

  for (const outcome of outcomes) {
    const headline = outcome.detail?.["headline"];
    if (typeof headline !== "string" || headline.length === 0) {
      ungrouped.push(outcome);
      continue;
    }
    const existing = groups.get(headline);
    if (existing) {
      existing.push(outcome);
    } else {
      groups.set(headline, [outcome]);
    }
  }

  const collapsed: SourceOutcome[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      collapsed.push(group[0]);
      continue;
    }
    const primary = group[0];
    const areaDescs = group.map((o) => o.detail?.["areaDesc"]).filter((a): a is string => typeof a === "string" && a.length > 0);

    collapsed.push({
      ...primary,
      detail: {
        ...primary.detail,
        areaDesc: areaDescs[0],
        affectedAreaGroups: areaDescs,
        mergedRecordCount: group.length,
      },
    });
  }

  return [...collapsed, ...ungrouped];
}

export async function evaluateNwsAlerts(lat: number, lon: number): Promise<SourceOutcome[]> {
  const zoneId = await resolveCountyZone(lat, lon);
  const alerts = await fetchActiveAlertsForZone(zoneId);

  const outcomes: SourceOutcome[] = [];

  for (const alert of alerts) {
    const p = alert?.properties;
    if (!p || typeof p.event !== "string") {
      outcomes.push({
        source: "NWS",
        tier: "government",
        signal: "Unparseable alert",
        status: "insufficient_data",
        weight: 1.0,
        detail: { rawAlert: alert },
        note: "Received an alert record missing expected fields; shown for awareness, not scored.",
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    const result = scoreNwsAlert(p.severity as NwsSeverity, p.certainty as NwsCertainty, p.urgency as NwsUrgency);

    outcomes.push({
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
        onset: p.onset ?? null,
        expires: p.expires ?? null,
        ends: p.ends ?? null,
        description: p.description ?? null,
        instruction: p.instruction ?? null,
      },
      note: result.note,
      timestamp: p.effective ?? new Date().toISOString(),
      rawRef: p["@id"],
    });
  }

  return collapseByHeadline(outcomes);
}
