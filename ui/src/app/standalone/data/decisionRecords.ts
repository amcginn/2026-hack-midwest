/**
 * Ported from server/src/repository/decisionRecord.ts for the
 * standalone (no-backend, GitHub Pages) build.
 *
 * STORAGE: localStorage holding a single JSON array (not an
 * append-only JSONL file, since there's no filesystem) -- survives
 * across sessions/tab-closes, same reasoning as facilityLinks.ts.
 * `randomUUID()` from node:crypto becomes the browser's
 * `crypto.randomUUID()`, which is available in all modern browsers
 * (and specifically GitHub Pages' HTTPS context, which is required
 * for the Web Crypto API to expose it).
 */

import type { SourceOutcome } from "../sources/types";
import type { Posture } from "../evaluator/posture";

const STORAGE_KEY = "facman-standalone:decision-records";

export interface DecisionRecordInput {
  source: string;
  signal: string;
  status: SourceOutcome["status"];
  postureScore?: number;
  weight: number;
  sourceReportedAt: string;
  note?: string;
  detail: Record<string, unknown>;
}

export interface DecisionRecordNotificationRecipient {
  employeeId: string;
  name: string;
  essentialPersonnel: boolean;
  reason: string;
}

export interface DecisionRecord {
  recordId: string;
  evaluatedAt: string;
  facilityId: string;
  facilityName: string;
  requestedDate: string;
  posture: Posture;
  postureLabel: string;
  recommendedPosture: Posture | null;
  wasOverridden: boolean;
  recommendedScore: number | null;
  experimentalBlendedScore: number | null;
  rationale: string;
  thresholdCrossed: string;
  confidence: string;
  whatWouldChange: string;
  governmentSourceErrored: boolean;
  inputs: DecisionRecordInput[];
  excludedInputs: DecisionRecordInput[];
  notificationRecipients: DecisionRecordNotificationRecipient[];
  sourceErrors: Array<{ source: string; error: string }>;
  decidedBy?: string;
  decisionNotes?: string;
}

function toDecisionRecordInput(outcome: SourceOutcome): DecisionRecordInput {
  return {
    source: outcome.source,
    signal: outcome.signal,
    status: outcome.status,
    postureScore: outcome.postureScore,
    weight: outcome.weight,
    sourceReportedAt: outcome.timestamp,
    note: outcome.note,
    detail: outcome.detail,
  };
}

export function buildDecisionRecord(params: {
  facilityId: string;
  facilityName: string;
  requestedDate: string;
  decidedPosture: Posture;
  recommendedPosture: Posture | null;
  postureLabel: string;
  recommendedScore: number | null;
  experimentalBlendedScore: number | null;
  rationale: string;
  thresholdCrossed: string;
  confidence: string;
  whatWouldChange: string;
  governmentSourceErrored: boolean;
  scoredSources: SourceOutcome[];
  excludedSources: SourceOutcome[];
  notificationRecipients: DecisionRecordNotificationRecipient[];
  sourceErrors: Array<{ source: string; error: string }>;
  decidedBy?: string;
  decisionNotes?: string;
}): DecisionRecord {
  return {
    recordId: crypto.randomUUID(),
    evaluatedAt: new Date().toISOString(),
    facilityId: params.facilityId,
    facilityName: params.facilityName,
    requestedDate: params.requestedDate,
    posture: params.decidedPosture,
    postureLabel: params.postureLabel,
    recommendedPosture: params.recommendedPosture,
    wasOverridden: params.recommendedPosture !== null && params.decidedPosture !== params.recommendedPosture,
    recommendedScore: params.recommendedScore,
    experimentalBlendedScore: params.experimentalBlendedScore,
    rationale: params.rationale,
    thresholdCrossed: params.thresholdCrossed,
    confidence: params.confidence,
    whatWouldChange: params.whatWouldChange,
    governmentSourceErrored: params.governmentSourceErrored,
    inputs: params.scoredSources.map(toDecisionRecordInput),
    excludedInputs: params.excludedSources.map(toDecisionRecordInput),
    notificationRecipients: params.notificationRecipients,
    sourceErrors: params.sourceErrors,
    decidedBy: params.decidedBy,
    decisionNotes: params.decisionNotes,
  };
}

function readAll(): DecisionRecord[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error("Could not parse decision records -- treating as empty, not crashing");
    return [];
  }
}

function writeAll(records: DecisionRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

/** Appends a decision record. Records are stored oldest-first
 * internally; readers get newest-first (see getAllDecisionRecords). */
export function appendDecisionRecord(record: DecisionRecord): void {
  const records = readAll();
  records.push(record);
  writeAll(records);
}

export function getAllDecisionRecords(): DecisionRecord[] {
  return [...readAll()].reverse();
}

export function getDecisionRecordsForFacility(facilityId: string): DecisionRecord[] {
  return getAllDecisionRecords().filter((r) => r.facilityId === facilityId);
}

export function getDecisionRecordById(recordId: string): DecisionRecord | undefined {
  return getAllDecisionRecords().find((r) => r.recordId === recordId);
}
