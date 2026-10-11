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
import { evaluateUsgsGaugeHeight, usgsAdapter } from "./sources/usgs";
import { evaluateAqicn, aqicnAdapter } from "./sources/aqicn";
import { evaluateIowaDotConditions, iowaDotAdapter } from "./sources/iowaDot";
import type { SupplementalAdapter } from "./sources/supplementalAdapter";
import { getAllFacilities, getFacilityById } from "./repository/facilities";
import { getEmployeesByHomeFacility } from "./repository/employees";
import { getScheduleEntries } from "./repository/schedule";
import { getApplicableEmployees, getNotificationRecipients } from "./repository/applicability";
import { aggregateSources } from "./evaluator/aggregate";
import { scoreToPosture, POSTURE_LABELS } from "./evaluator/posture";
import { buildExplanation } from "./evaluator/explain";
import { buildRationale } from "./rationale/templates";
import { buildNotificationMessages } from "./notification/templates";
import type { SourceOutcome } from "./sources/types";
import {
  buildDecisionRecord,
  appendDecisionRecord,
  getAllDecisionRecords,
  getDecisionRecordsForFacility,
  getDecisionRecordById,
} from "./repository/decisionRecord";
import {
  buildNotificationLogEntry,
  appendNotificationLogEntries,
  getNotificationLogForFacility,
  type NotificationChannel,
} from "./repository/notificationLog";
import { getFacilityLinks, addFacilityLink, removeFacilityLink, isValidHttpUrl } from "./repository/facilityLinks";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

// Supplemental (non-NWS) source registry. NWS stays hardcoded in
// runEvaluation -- it's the one source explicitly named as "the core
// source" in the challenge text and the only source that drives the
// recommended posture. Everything else implements SupplementalAdapter
// (see sources/supplementalAdapter.ts) so adding a new source (DOT
// road conditions, power outage reporting, etc.) means writing one
// adapter and adding it here -- no changes to runEvaluation's control
// flow. Refactored 2026-10-11 from a hardcoded Promise.allSettled
// array + parallel sourceNames array for error labeling, which was
// fragile (adding a source in the wrong array slot would silently
// mislabel its errors).
const supplementalAdapters: SupplementalAdapter[] = [usgsAdapter, aqicnAdapter, iowaDotAdapter];

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

/**
 * Fourth integration slice: live Iowa DOT 511 winter road conditions.
 * Iowa-only (see sources/iowaDot.ts) -- only meaningful for lat/lon
 * within or near Iowa.
 *
 * Example: GET /api/sources/iowa-dot?lat=41.8847&lon=-90.1943 (Clinton, IA)
 */
app.get("/api/sources/iowa-dot", async (req: Request, res: Response) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    res.status(400).json({ error: "lat and lon query params are required numbers" });
    return;
  }

  try {
    const outcome = await evaluateIowaDotConditions(lat, lon);
    res.json({ lat, lon, outcome });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Iowa DOT road-conditions lookup failed", detail: message });
  }
});

app.get("/api/facilities", (_req: Request, res: Response) => {
  res.json({ facilities: getAllFacilities() });
});

app.get("/api/facilities/:facilityId", (req: Request, res: Response) => {
  const facility = getFacilityById(req.params.facilityId);
  if (!facility) {
    res.status(404).json({ error: `Unknown facilityId: ${req.params.facilityId}` });
    return;
  }
  res.json(facility);
});

/**
 * Per-facility custom reference links -- see repository/facilityLinks.ts
 * module doc. Genuinely writable at runtime (unlike the rest of the
 * facility record, which is hand-authored seed data loaded once at
 * server start -- see repository/facilities.ts).
 */
app.get("/api/facilities/:facilityId/links", (req: Request, res: Response) => {
  const facility = getFacilityById(req.params.facilityId);
  if (!facility) {
    res.status(404).json({ error: `Unknown facilityId: ${req.params.facilityId}` });
    return;
  }
  res.json({ links: getFacilityLinks(req.params.facilityId) });
});

app.post("/api/facilities/:facilityId/links", (req: Request, res: Response) => {
  const { facilityId } = req.params;
  const facility = getFacilityById(facilityId);
  if (!facility) {
    res.status(404).json({ error: `Unknown facilityId: ${facilityId}` });
    return;
  }

  const label = typeof req.body?.label === "string" ? req.body.label.trim() : "";
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";

  if (!label) {
    res.status(400).json({ error: "label is required" });
    return;
  }
  if (!url || !isValidHttpUrl(url)) {
    res.status(400).json({ error: "url must be a valid http:// or https:// URL" });
    return;
  }

  const link = addFacilityLink(facilityId, label, url);
  res.status(201).json(link);
});

app.delete("/api/facilities/:facilityId/links/:linkId", (req: Request, res: Response) => {
  const { facilityId, linkId } = req.params;
  const facility = getFacilityById(facilityId);
  if (!facility) {
    res.status(404).json({ error: `Unknown facilityId: ${facilityId}` });
    return;
  }

  const removed = removeFacilityLink(facilityId, linkId);
  if (!removed) {
    res.status(404).json({ error: `Unknown linkId: ${linkId}` });
    return;
  }
  res.status(204).send();
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

  const evalResult = await runEvaluation(facilityId, date);
  if (!evalResult) {
    res.status(404).json({ error: `Unknown facilityId: ${facilityId}` });
    return;
  }

  // NOTE (changed 2026-10-11, per user): /evaluate is read-only and
  // does NOT persist a decision record. Viewing/refreshing the
  // dashboard is not a decision -- recording one is an explicit action
  // a facility manager takes (see POST /decisions below).

  // Distinct from governmentSourceErrored: this is the LEGITIMATE "we
  // checked and there's genuinely nothing active" case, not a failure.
  // Still flagged explicitly rather than left implicit in prose, since
  // "we have zero primary data for this decision" is itself important
  // decision-relevant information per the user (2026-10-11) -- a
  // reassuring green banner shouldn't be the only signal either way.
  const noGovernmentDataAvailable =
    !evalResult.governmentSourceErrored && evalResult.scoredSources.filter((s) => s.tier === "government").length === 0;

  res.json({
    facilityId,
    facilityName: evalResult.facility.name,
    // Facility detail fields named explicitly in the challenge's
    // facility-model requirement ("location, hours, ... accessibility
    // needs") -- previously only `facilityName` was returned here;
    // address/hours/accessibilityNotes existed in the data model and
    // synthetic YAML but were never surfaced via this response or the
    // UI (section 7 gap tracker, closed 2026-10-11).
    facility: {
      address: evalResult.facility.address,
      hours: evalResult.facility.hours,
      buildingType: evalResult.facility.buildingType,
      accessibilityNotes: evalResult.facility.accessibilityNotes,
      // Curated, non-scored reference links for this facility -- see
      // repository/facilityLinks.ts module doc. Not part of
      // runEvaluation (not fetched/scored), read directly here since
      // it's just a per-facility display concern.
      customLinks: getFacilityLinks(facilityId),
    },
    date,
    posture: evalResult.posture,
    postureLabel: POSTURE_LABELS[evalResult.posture],
    noGovernmentDataAvailable,
    recommendedScore: evalResult.recommendedScore ?? null,
    // Reference only -- known to be wrong across unrelated hazard
    // dimensions (see evaluator/aggregate.ts module doc, 2026-10-11).
    // Does NOT drive `posture` above.
    experimentalBlendedScore: evalResult.experimentalBlendedScore ?? null,
    rationale: evalResult.rationale,
    // Deliverable #2's explicitly-named fields: "which threshold was
    // crossed and by how much," "confidence," and "what would change
    // the recommendation." See evaluator/explain.ts.
    thresholdCrossed: evalResult.explanation.thresholdCrossed,
    confidence: evalResult.explanation.confidence,
    whatWouldChange: evalResult.explanation.whatWouldChange,
    sources: {
      government: evalResult.scoredSources.filter((s) => s.tier === "government"),
      supplemental: evalResult.supplementalScored,
      excluded: evalResult.excludedSources,
    },
    notification: {
      recipientCount: evalResult.notificationRecipients.length,
      recipients: evalResult.notificationRecipients,
    },
    sourceErrors: evalResult.sourceErrors,
  });
});

/**
 * Core evaluation logic, shared between the read-only GET /evaluate
 * route and the POST /decisions route (which needs the same
 * source-fetching/scoring to build the record it persists). Extracted
 * 2026-10-11 when /evaluate stopped auto-persisting, so POST
 * /decisions could re-run a fresh evaluation at decision time without
 * duplicating the fetch/aggregate/rationale logic.
 */
async function runEvaluation(facilityId: string, date: string) {
  const facility = getFacilityById(facilityId);
  if (!facility) return undefined;

  const { lat, lon } = facility.coordinates;
  const outcomes: SourceOutcome[] = [];
  const sourceErrors: Array<{ source: string; error: string }> = [];

  const applicableAdapters = supplementalAdapters.filter((a) => a.isApplicable(facility));

  const results = await Promise.allSettled([
    evaluateNwsAlerts(lat, lon),
    ...applicableAdapters.map((a) => a.evaluate(facility)),
  ]);

  const resultNames = ["NWS", ...applicableAdapters.map((a) => a.name)];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      outcomes.push(...result.value);
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      sourceErrors.push({ source: resultNames[i], error: message });
    }
  });

  const { recommendedScore, drivingSource, experimentalBlendedScore, scoredSources, excludedSources } =
    aggregateSources(outcomes);

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
  const explanation = buildExplanation(posture, recommendedScore, drivingSource, governmentSourceErrored);
  const recipients = getNotificationRecipients(facilityId, date);
  const notificationRecipients = recipients.map((r) => {
    const messages = buildNotificationMessages(
      facility.name,
      posture,
      date,
      drivingSource?.signal,
      r.employee.essentialPersonnel,
    );
    return {
      employeeId: r.employee.employeeId,
      name: r.employee.name,
      phone: r.employee.phone,
      email: r.employee.email,
      essentialPersonnel: r.employee.essentialPersonnel,
      reason: r.reason,
      longFormMessage: messages.longForm,
      shortFormMessage: messages.shortForm,
    };
  });

  return {
    facility,
    posture,
    recommendedScore,
    experimentalBlendedScore,
    rationale,
    explanation,
    governmentSourceErrored,
    scoredSources,
    excludedSources,
    supplementalScored,
    notificationRecipients,
    sourceErrors,
  };
}

/**
 * Explicitly record a decision for a facility -- deliverable #4's
 * "what was known, when, and what was decided." This is the ONLY
 * route that persists a decision record (changed 2026-10-11, per
 * user: viewing/refreshing the dashboard is not a decision; recording
 * one is a deliberate action a facility manager takes).
 *
 * Re-runs a fresh evaluation at the moment of decision (not reusing
 * potentially-stale client-held state), then persists it with the
 * ACTUAL decided posture, which may override the system's
 * recommendation -- the challenge is explicit that automating the
 * decision is not the goal.
 *
 * Body: { date?: string, decidedPosture?: Posture, decidedBy?: string, notes?: string }
 * If decidedPosture is omitted, the system's recommended posture is used.
 */
app.post("/api/facilities/:facilityId/decisions", async (req: Request, res: Response) => {
  const { facilityId } = req.params;
  const date = typeof req.body?.date === "string" ? req.body.date : new Date().toISOString().slice(0, 10);
  const decidedPostureOverride = typeof req.body?.decidedPosture === "string" ? req.body.decidedPosture : undefined;
  const decidedBy = typeof req.body?.decidedBy === "string" ? req.body.decidedBy : undefined;
  const decisionNotes = typeof req.body?.notes === "string" ? req.body.notes : undefined;

  const evalResult = await runEvaluation(facilityId, date);
  if (!evalResult) {
    res.status(404).json({ error: `Unknown facilityId: ${facilityId}` });
    return;
  }

  const decidedPosture = (decidedPostureOverride as ReturnType<typeof scoreToPosture>) ?? evalResult.posture;

  const record = buildDecisionRecord({
    facilityId,
    facilityName: evalResult.facility.name,
    requestedDate: date,
    decidedPosture,
    recommendedPosture: evalResult.posture,
    postureLabel: POSTURE_LABELS[decidedPosture],
    recommendedScore: evalResult.recommendedScore ?? null,
    experimentalBlendedScore: evalResult.experimentalBlendedScore ?? null,
    rationale: evalResult.rationale,
    thresholdCrossed: evalResult.explanation.thresholdCrossed,
    confidence: evalResult.explanation.confidence,
    whatWouldChange: evalResult.explanation.whatWouldChange,
    governmentSourceErrored: evalResult.governmentSourceErrored,
    scoredSources: evalResult.scoredSources,
    excludedSources: evalResult.excludedSources,
    notificationRecipients: evalResult.notificationRecipients,
    sourceErrors: evalResult.sourceErrors,
    decidedBy,
    decisionNotes,
  });

  try {
    appendDecisionRecord(record);
  } catch (err) {
    console.error("FAILED TO PERSIST DECISION RECORD -- audit trail is incomplete:", err);
    res.status(500).json({ error: "Failed to persist decision record" });
    return;
  }

  res.status(201).json(record);
});

/**
 * Log a notification send -- deliverable #3's "channel routing" plus
 * the explicit-action audit trail the user asked for (2026-10-11,
 * "I'd say audit as a separate log"). This does NOT send a real
 * email/SMS (per user: "let's start out with just logged" -- real
 * dispatch via the demo AWS account is a stretch item if time allows).
 * Clicking "Notify" or "Notify All" IS the action being audited here;
 * the log entry records exactly what message/channel was shown for
 * each recipient at that moment.
 *
 * Re-runs a fresh evaluation (same reconstructability principle as
 * POST /decisions) so the drafted message reflects current conditions
 * at send time, not stale client state.
 *
 * Body:
 *   date?: string
 *   decisionRecordId?: string | null  -- links to a prior decision, if any
 *   employeeIds?: string[]            -- specific recipients (per-row "Notify")
 *   notifyAll?: boolean               -- true for the bulk "Notify All" action
 *                                        (equivalent to selecting every current
 *                                        recipient, logged the same way, fewer clicks)
 *   channel?: "email" | "sms"         -- defaults to "email" if omitted
 */
app.post("/api/facilities/:facilityId/notifications", async (req: Request, res: Response) => {
  const { facilityId } = req.params;
  const date = typeof req.body?.date === "string" ? req.body.date : new Date().toISOString().slice(0, 10);
  const decisionRecordId = typeof req.body?.decisionRecordId === "string" ? req.body.decisionRecordId : null;
  const notifyAll = req.body?.notifyAll === true;
  const requestedEmployeeIds: string[] = Array.isArray(req.body?.employeeIds) ? req.body.employeeIds : [];
  const channel: NotificationChannel = req.body?.channel === "sms" ? "sms" : "email";

  const evalResult = await runEvaluation(facilityId, date);
  if (!evalResult) {
    res.status(404).json({ error: `Unknown facilityId: ${facilityId}` });
    return;
  }

  const targetRecipients = notifyAll
    ? evalResult.notificationRecipients
    : evalResult.notificationRecipients.filter((r) => requestedEmployeeIds.includes(r.employeeId));

  if (targetRecipients.length === 0) {
    res.status(400).json({ error: "No matching recipients to notify. Pass employeeIds or notifyAll=true." });
    return;
  }

  const postureLabel = POSTURE_LABELS[evalResult.posture];
  const entries = targetRecipients.map((r) =>
    buildNotificationLogEntry({
      facilityId,
      facilityName: evalResult.facility.name,
      decisionRecordId,
      posture: evalResult.posture,
      postureLabel,
      employeeId: r.employeeId,
      employeeName: r.name,
      essentialPersonnel: r.essentialPersonnel,
      channel,
      messageText: channel === "sms" ? r.shortFormMessage ?? r.longFormMessage : r.longFormMessage,
      sentViaBulkAction: notifyAll,
    }),
  );

  try {
    appendNotificationLogEntries(entries);
  } catch (err) {
    console.error("FAILED TO PERSIST NOTIFICATION LOG -- audit trail is incomplete:", err);
    res.status(500).json({ error: "Failed to persist notification log" });
    return;
  }

  res.status(201).json({ count: entries.length, entries });
});

/**
 * Notification send history for a facility -- separate audit trail
 * from decision records (see notification/templates.ts +
 * repository/notificationLog.ts module docs for why).
 *
 * Example: GET /api/facilities/USDA-FSA-IA-CLINTON/notifications
 */
app.get("/api/facilities/:facilityId/notifications", (req: Request, res: Response) => {
  const { facilityId } = req.params;
  const entries = getNotificationLogForFacility(facilityId);
  res.json({ count: entries.length, entries });
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
