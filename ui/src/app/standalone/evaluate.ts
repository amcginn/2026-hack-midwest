/**
 * Standalone equivalent of server/src/app.ts's runEvaluation() +
 * route handlers. Mirrors that control flow exactly (facility lookup
 * -> fetch NWS + applicable supplemental adapters via
 * Promise.allSettled -> aggregateSources -> scoreToPosture ->
 * buildRationale/buildExplanation -> getNotificationRecipients ->
 * buildNotificationMessages per recipient), but runs entirely in the
 * browser instead of on a server, and returns response shapes that
 * match ui/src/app/models/facility.model.ts directly instead of
 * going over HTTP.
 */

import { evaluateNwsAlerts } from "./sources/nws";
import { usgsAdapter } from "./sources/usgs";
import { iowaDotAdapter } from "./sources/iowaDot";
import { aqicnAdapter } from "./sources/aqicn";
import type { SupplementalAdapter } from "./sources/supplementalAdapter";
import { getFacilityById } from "./data/facilities";
import { getEmployeesByHomeFacility } from "./data/employees";
import { getScheduleEntries } from "./data/schedule";
import { getApplicableEmployees, getNotificationRecipients } from "./data/applicability";
import { aggregateSources } from "./evaluator/aggregate";
import { scoreToPosture, POSTURE_LABELS, type Posture } from "./evaluator/posture";
import { buildExplanation } from "./evaluator/explain";
import { buildRationale } from "./rationale/templates";
import { buildNotificationMessages } from "./notification/templates";
import type { SourceOutcome } from "./sources/types";
import { getFacilityLinks } from "./data/facilityLinks";
import type {
  FacilityEvaluation,
  FacilityRoster,
  NotificationRecipient,
  SourceError,
} from "../models/facility.model";

// Same adapter registry as the server's app.ts, same reasoning: NWS
// stays hardcoded as the one government/driving source; everything
// else implements SupplementalAdapter so it's filtered by
// isApplicable() per facility.
const supplementalAdapters: SupplementalAdapter[] = [usgsAdapter, aqicnAdapter, iowaDotAdapter];

interface EvaluationResult {
  facility: ReturnType<typeof getFacilityById>;
  posture: Posture;
  recommendedScore?: number;
  experimentalBlendedScore?: number;
  rationale: string;
  explanation: ReturnType<typeof buildExplanation>;
  governmentSourceErrored: boolean;
  scoredSources: SourceOutcome[];
  excludedSources: SourceOutcome[];
  supplementalScored: SourceOutcome[];
  notificationRecipients: NotificationRecipient[];
  sourceErrors: SourceError[];
}

async function runEvaluation(facilityId: string, date: string): Promise<EvaluationResult | undefined> {
  const facility = getFacilityById(facilityId);
  if (!facility) return undefined;

  const { lat, lon } = facility.coordinates;
  const outcomes: SourceOutcome[] = [];
  const sourceErrors: SourceError[] = [];

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
  let posture: Posture;
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
  const notificationRecipients: NotificationRecipient[] = recipients.map((r) => {
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
      scheduleNote: r.scheduleNote,
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

/** Standalone equivalent of GET /api/facilities/:facilityId/evaluate. */
export async function evaluateFacility(facilityId: string, date?: string): Promise<FacilityEvaluation | undefined> {
  const resolvedDate = date ?? new Date().toISOString().slice(0, 10);
  const evalResult = await runEvaluation(facilityId, resolvedDate);
  if (!evalResult || !evalResult.facility) return undefined;

  const noGovernmentDataAvailable =
    !evalResult.governmentSourceErrored && evalResult.scoredSources.filter((s) => s.tier === "government").length === 0;

  return {
    facilityId,
    facilityName: evalResult.facility.name,
    facility: {
      address: evalResult.facility.address,
      hours: evalResult.facility.hours,
      buildingType: evalResult.facility.buildingType,
      accessibilityNotes: evalResult.facility.accessibilityNotes,
      customLinks: getFacilityLinks(facilityId),
    },
    date: resolvedDate,
    posture: evalResult.posture,
    postureLabel: POSTURE_LABELS[evalResult.posture],
    noGovernmentDataAvailable,
    recommendedScore: evalResult.recommendedScore ?? null,
    experimentalBlendedScore: evalResult.experimentalBlendedScore ?? null,
    rationale: evalResult.rationale,
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
  };
}

/** Standalone equivalent of GET /api/facilities/:facilityId/roster. */
export function getFacilityRoster(facilityId: string, date?: string): FacilityRoster | undefined {
  const resolvedDate = date ?? new Date().toISOString().slice(0, 10);
  const facility = getFacilityById(facilityId);
  if (!facility) return undefined;

  const roster = getEmployeesByHomeFacility(facilityId);
  const scheduleEntries = getScheduleEntries(facilityId, resolvedDate);
  const scheduleByEmployeeId = new Map(scheduleEntries.map((e) => [e.employeeId, e]));
  const applicableIds = new Set(getApplicableEmployees(facilityId, resolvedDate).map((a) => a.employee.employeeId));

  return {
    facilityId,
    date: resolvedDate,
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
        workHours: employee.workHours,
        accessibilityNotes: employee.accessibilityNotes,
      };
    }),
  };
}

/**
 * Standalone equivalent of POST /api/facilities/:facilityId/decisions.
 * Re-runs a fresh evaluation (same reconstructability principle as the
 * server route) rather than reusing client-held state, then returns
 * the fields needed by the caller to build+persist a DecisionRecord
 * via standalone/data/decisionRecords.ts.
 */
export async function runEvaluationForDecision(facilityId: string, date: string) {
  return runEvaluation(facilityId, date);
}
