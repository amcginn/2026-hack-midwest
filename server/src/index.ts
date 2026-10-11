import path from "node:path";
import dotenv from "dotenv";
import express, { type Request, type Response } from "express";
import cors from "cors";

// .env lives at the project root (2026-hack-midwest/.env), not inside
// server/ -- shared across server/cdk/ui per docs/project-scope.md's
// Credentials & Secrets section. Loaded explicitly rather than relying
// on dotenv's default cwd-relative lookup.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
import { evaluateNwsAlerts } from "./sources/nws";
import { evaluateUsgsGaugeHeight } from "./sources/usgs";
import { evaluateAqicn } from "./sources/aqicn";
import { getAllFacilities, getFacilityById } from "./repository/facilities";
import { getEmployeesByHomeFacility } from "./repository/employees";
import { getScheduleEntries } from "./repository/schedule";
import { getApplicableEmployees, getNotificationRecipients } from "./repository/applicability";
import { aggregateSources } from "./evaluator/aggregate";
import { scoreToPosture, POSTURE_LABELS } from "./evaluator/posture";
import { buildRationale } from "./rationale/templates";
import type { SourceOutcome } from "./sources/types";
import {
  buildDecisionRecord,
  appendDecisionRecord,
  getAllDecisionRecords,
  getDecisionRecordsForFacility,
  getDecisionRecordById,
} from "./repository/decisionRecord";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

// Local-dev CORS: UI runs on :4200 (Angular default), server on :3001.
// No authn/z in this POC (explicit decision, section 6) -- CORS here
// is purely about enabling the local dev server pairing, not a
// security boundary.
app.use(cors({ origin: "http://localhost:4200" }));
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

/**
 * First real integration slice: hit the live NWS pipeline for an
 * arbitrary lat/lon and return the scored outcomes.
 *
 * Example: GET /api/sources/nws?lat=41.8847&lon=-90.1943  (Clinton, IA)
 */
app.get("/api/sources/nws", async (req: Request, res: Response) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    res.status(400).json({ error: "lat and lon query params are required numbers" });
    return;
  }

  try {
    const outcomes = await evaluateNwsAlerts(lat, lon);
    res.json({ lat, lon, outcomes });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "NWS lookup failed", detail: message });
  }
});

/**
 * Second integration slice: live river gauge data via NOAA's NWPS API.
 *
 * Accepts either a USGS site number or an NWPS location ID -- confirmed
 * live via NWPS's own swagger spec and a direct test that both resolve
 * to the same gauge.
 *
 * Examples:
 *   GET /api/sources/usgs?identifier=05420500  (USGS site number)
 *   GET /api/sources/usgs?identifier=CMMI4     (NWPS location ID)
 */
app.get("/api/sources/usgs", async (req: Request, res: Response) => {
  const identifier = typeof req.query.identifier === "string" ? req.query.identifier : undefined;

  if (!identifier) {
    res.status(400).json({ error: "identifier query param is required (USGS site number or NWPS lid)" });
    return;
  }

  try {
    const outcome = await evaluateUsgsGaugeHeight(identifier);
    res.json({ identifier, outcome });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "River gauge lookup failed", detail: message });
  }
});

/**
 * Third integration slice: live AQI via AQICN.
 *
 * Example: GET /api/sources/aqicn?lat=41.8847&lon=-90.1943 (Clinton, IA)
 */
app.get("/api/sources/aqicn", async (req: Request, res: Response) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    res.status(400).json({ error: "lat and lon query params are required numbers" });
    return;
  }

  try {
    const outcome = await evaluateAqicn(lat, lon);
    res.json({ lat, lon, outcome });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "AQICN lookup failed", detail: message });
  }
});

app.get("/api/facilities", (_req: Request, res: Response) => {
  res.json({ facilities: getAllFacilities() });
});

/**
 * Full employee roster for a facility, with today's schedule-exception
 * status and applicability flags -- separate from /evaluate's
 * notification recipient list so it's visible WHY someone is or isn't
 * being notified (e.g. "0 recipients" because zero employees are
 * seeded for this facility, vs. because everyone's excluded today --
 * these look identical from /evaluate alone).
 *
 * Example: GET /api/facilities/USDA-FSA-IA-CLINTON/roster?date=2026-10-11
 */
app.get("/api/facilities/:facilityId/roster", (req: Request, res: Response) => {
  const { facilityId } = req.params;
  const date = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().slice(0, 10);

  const facility = getFacilityById(facilityId);
  if (!facility) {
    res.status(404).json({ error: `Unknown facilityId: ${facilityId}` });
    return;
  }

  const roster = getEmployeesByHomeFacility(facilityId);
  const scheduleEntries = getScheduleEntries(facilityId, date);
  const scheduleByEmployeeId = new Map(scheduleEntries.map((e) => [e.employeeId, e]));
  const applicableIds = new Set(getApplicableEmployees(facilityId, date).map((a) => a.employee.employeeId));

  res.json({
    facilityId,
    date,
    rosterCount: roster.length,
    roster: roster.map((employee) => {
      const scheduleEntry = scheduleByEmployeeId.get(employee.employeeId);
      return {
        employeeId: employee.employeeId,
        name: employee.name,
        role: employee.role,
        remoteStatus: employee.remoteStatus,
        essentialPersonnel: employee.essentialPersonnel,
        teleworkEligible: employee.teleworkEligible,
        todayStatus: scheduleEntry?.status ?? employee.remoteStatus,
        scheduleNote: scheduleEntry?.locationNote,
        applicableToday: applicableIds.has(employee.employeeId),
      };
    }),
  });
});

/**
 * Full facility evaluation: fetches every configured source for the
 * facility, aggregates per section 4, maps to a posture, computes
 * applicable notification recipients per section 1, and builds the
 * templated rationale per section 5.
 *
 * Example: GET /api/facilities/USDA-FSA-IA-CLINTON/evaluate?date=2026-10-11
 */
app.get("/api/facilities/:facilityId/evaluate", async (req: Request, res: Response) => {
  const { facilityId } = req.params;
  const date = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().slice(0, 10);

  const facility = getFacilityById(facilityId);
  if (!facility) {
    res.status(404).json({ error: `Unknown facilityId: ${facilityId}` });
    return;
  }

  const { lat, lon } = facility.coordinates;
  const outcomes: SourceOutcome[] = [];
  const sourceErrors: Array<{ source: string; error: string }> = [];

  // Each source is fetched independently -- one source failing (e.g. a
  // network blip) should not take down the whole evaluation. Matches
  // the per-adapter resilience already built into each adapter.
  const results = await Promise.allSettled([
    evaluateNwsAlerts(lat, lon),
    facility.riverGaugeId
      ? evaluateUsgsGaugeHeight(facility.riverGaugeId).then((o) => [o])
      : Promise.resolve<SourceOutcome[]>([]),
    evaluateAqicn(lat, lon).then((o) => [o]),
  ]);

  const sourceNames = ["NWS", "USGS/NWPS", "AQICN"];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      outcomes.push(...result.value);
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      sourceErrors.push({ source: sourceNames[i], error: message });
    }
  });

  const { recommendedScore, drivingSource, experimentalBlendedScore, scoredSources, excludedSources } =
    aggregateSources(outcomes);

  // CRITICAL: "no government-tier score" has two very different causes
  // that must NOT be conflated. (1) NWS was reached successfully and
  // legitimately has no active alert for this facility -- that's a
  // real "nothing to report," reasonably treated as normal. (2) NWS
  // *errored* (network failure, 500, timeout) -- we have NO IDEA what
  // the actual conditions are, and defaulting to "normal" would be
  // actively misleading (confirmed live, 2026-10-11: a transient NWS
  // 500 produced a green "Normal Operations" banner while the real
  // status was unknown, not confirmed-clear). Only case (1) is allowed
  // to resolve to "normal"; case (2) must resolve to "unknown".
  const governmentSourceErrored = sourceErrors.some((e) => e.source === "NWS");
  let posture: ReturnType<typeof scoreToPosture>;
  if (recommendedScore !== undefined) {
    posture = scoreToPosture(recommendedScore);
  } else if (governmentSourceErrored) {
    posture = "unknown";
  } else {
    posture = "normal";
  }

  const supplementalScored = scoredSources.filter((s) => s.tier === "supplemental");
  const rationale = buildRationale(facility.name, posture, drivingSource, supplementalScored, governmentSourceErrored);
  const recipients = getNotificationRecipients(facilityId, date);
  const notificationRecipients = recipients.map((r) => ({
    employeeId: r.employee.employeeId,
    name: r.employee.name,
    essentialPersonnel: r.employee.essentialPersonnel,
    reason: r.reason,
  }));

  // Decision record: section 7's highest-priority gap. Persisted on
  // every evaluation so the system builds a real, reconstructable
  // audit trail -- "what was known, when, and what was decided" -- not
  // just a point-in-time API response that disappears after the
  // request. Write failures are logged loudly but never block the
  // response; a broken audit trail should be visible, not silent.
  try {
    const record = buildDecisionRecord({
      facilityId,
      facilityName: facility.name,
      requestedDate: date,
      posture,
      postureLabel: POSTURE_LABELS[posture],
      recommendedScore: recommendedScore ?? null,
      experimentalBlendedScore: experimentalBlendedScore ?? null,
      rationale,
      governmentSourceErrored,
      scoredSources,
      excludedSources,
      notificationRecipients,
      sourceErrors,
    });
    appendDecisionRecord(record);
  } catch (err) {
    console.error("FAILED TO PERSIST DECISION RECORD -- audit trail is incomplete:", err);
  }
  // Note: appendDecisionRecord may skip writing if this evaluation is
  // a material duplicate of the facility's most recent record within
  // the dedup window (see repository/decisionRecord.ts) -- this is
  // expected and desired, not a failure.

  res.json({
    facilityId,
    facilityName: facility.name,
    date,
    posture,
    postureLabel: POSTURE_LABELS[posture],
    recommendedScore: recommendedScore ?? null,
    // Reference only -- known to be wrong across unrelated hazard
    // dimensions (see evaluator/aggregate.ts module doc, 2026-10-11).
    // Does NOT drive `posture` above.
    experimentalBlendedScore: experimentalBlendedScore ?? null,
    rationale,
    sources: {
      government: scoredSources.filter((s) => s.tier === "government"),
      supplemental: supplementalScored,
      excluded: excludedSources,
    },
    notification: {
      recipientCount: notificationRecipients.length,
      recipients: notificationRecipients,
    },
    sourceErrors,
  });
});

/**
 * Decision record history -- the audit trail required by deliverable
 * #4 ("what was known, when, and what was decided... reconstructable
 * after the fact"). Every /evaluate call appends one record here.
 *
 * Examples:
 *   GET /api/decision-records                       (all, newest first)
 *   GET /api/decision-records?facilityId=USDA-...    (one facility's history)
 */
app.get("/api/decision-records", (req: Request, res: Response) => {
  const facilityId = typeof req.query.facilityId === "string" ? req.query.facilityId : undefined;
  const records = facilityId ? getDecisionRecordsForFacility(facilityId) : getAllDecisionRecords();
  res.json({ count: records.length, records });
});

app.get("/api/decision-records/:recordId", (req: Request, res: Response) => {
  const record = getDecisionRecordById(req.params.recordId);
  if (!record) {
    res.status(404).json({ error: `Unknown recordId: ${req.params.recordId}` });
    return;
  }
  res.json(record);
});

app.listen(PORT, () => {
  console.log(`USDA facility decisions server listening on http://localhost:${PORT}`);
});
