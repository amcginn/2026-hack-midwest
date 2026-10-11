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
const REQUEST_TIMEOUT_MS = 8000;

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
    /** When the hazard itself is expected to begin -- distinct from
     * `effective` (when the ALERT record became effective, which can
     * be well before the hazard actually starts). Not always present
     * on every alert type. */
    onset?: string;
    /** When this specific alert record expires (may be superseded by
     * an "Update"/"Extended" message before the hazard itself ends --
     * see `ends` below for the hazard's actual expected end). */
    expires?: string;
    /** When the underlying hazard is expected to end, per NWS's own
     * VTEC-derived field -- the more decision-relevant "how long will
     * this last" answer than `expires`. Not always present. */
    ends?: string;
    /** The full WHAT/WHERE/WHEN/IMPACTS narrative -- real content NWS
     * provides but we weren't capturing. Can be long (multiple
     * paragraphs); shown collapsed/expandable in the UI, not inline. */
    description?: string;
    /** NWS's own "what the public should do" guidance -- directly
     * relevant to the challenge's notification deliverable ("what
     * they're supposed to do"). */
    instruction?: string;
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
    headers: { "User-Agent": USER_AGENT },
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

/**
 * NWS issues one CAP alert record per forecast zone grouping, even
 * when the same warning (identical headline/severity/certainty/
 * urgency/effective time) spans several such groupings. Confirmed
 * live, 2026-10-11: a single Winter Storm Warning for Great Falls, MT
 * came back as 3 separate /alerts/active features, each with the same
 * headline but a different areaDesc zone list -- even though we only
 * ever query the facility's OWN resolved zone (see module doc; this
 * isn't a multi-zone query bug on our side, NWS's own feed fans one
 * warning across multiple records for a single zone query).
 *
 * To a facility manager these are one warning, not three -- showing
 * identical-looking cards 3x with no explanation reads as a bug.
 * Collapse by headline, keep one scored outcome, and merge the area
 * descriptions so the full NWS-reported coverage is still visible.
 */
function collapseByHeadline(outcomes: SourceOutcome[]): SourceOutcome[] {
  const groups = new Map<string, SourceOutcome[]>();
  const ungrouped: SourceOutcome[] = [];

  for (const outcome of outcomes) {
    const headline = outcome.detail?.["headline"];
    if (typeof headline !== "string" || headline.length === 0) {
      // No headline to group by (e.g. the insufficient_data
      // "Unparseable alert" case) -- pass through unmerged.
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
    const areaDescs = group
      .map((o) => o.detail?.["areaDesc"])
      .filter((a): a is string => typeof a === "string" && a.length > 0);

    collapsed.push({
      ...primary,
      detail: {
        ...primary.detail,
        areaDesc: areaDescs[0],
        // Full per-zone breakdown preserved for anyone who wants to
        // see exactly which NWS zone groupings this warning spans --
        // not shown by default, since zone granularity isn't
        // decision-relevant to a facility manager, but not discarded
        // either (reconstructability matters for the decision record
        // too, not just the live dashboard).
        affectedAreaGroups: areaDescs,
        mergedRecordCount: group.length,
      },
    });
  }

  return [...collapsed, ...ungrouped];
}

/**
 * Fetch and score all active NWS alerts for a facility's lat/lon.
 * Returns one SourceOutcome per DISTINCT active warning (same
 * headline collapsed into one record -- see collapseByHeadline above).
 */
export async function evaluateNwsAlerts(lat: number, lon: number): Promise<SourceOutcome[]> {
  const zoneId = await resolveCountyZone(lat, lon);
  const alerts = await fetchActiveAlertsForZone(zoneId);

  const outcomes: SourceOutcome[] = [];

  for (const alert of alerts) {
    // One malformed alert record should not take down the whole
    // facility evaluation -- skip it and surface it as insufficient_data
    // so it's still visible rather than silently dropped.
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

    const result = scoreNwsAlert(
      p.severity as NwsSeverity,
      p.certainty as NwsCertainty,
      p.urgency as NwsUrgency,
    );

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
