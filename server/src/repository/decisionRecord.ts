/**
 * Decision record persistence. See docs/project-scope.md section 7 --
 * explicitly named by the challenge as "the deliverable most teams will
 * skip." Captures what was known, when, and what was decided, so it's
 * reconstructable after the fact.
 *
 * TIMESTAMP DISTINCTION (per user flag, 2026-10-11): a record must
 * separate two different "when"s:
 *   - `evaluatedAt`      -- when WE ran this evaluation (our clock)
 *   - each input's own   -- when the SOURCE itself last updated its data
 *     `sourceReportedAt`    (NWS `effective`, NWPS `validTime`, AQICN
 *                            `time.iso` -- all confirmed available live,
 *                            2026-10-11). Recording only our own eval
 *                            time would lose "was the source's data
 *                            itself stale at the moment we looked,"
 *                            which matters for genuine reconstructability.
 *
 * Storage: append-only JSONL (one JSON object per line) under
 * data/decision-records/, file-backed like the rest of the repository
 * layer -- no DB needed for the hackathon, trivially greppable/
 * reconstructable by hand if needed.
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { SourceOutcome } from "../sources/types";
import type { Posture } from "../evaluator/posture";

const DECISION_RECORDS_DIR = path.resolve(__dirname, "../../../data/decision-records");
const DECISION_RECORDS_FILE = path.join(DECISION_RECORDS_DIR, "records.jsonl");

export interface DecisionRecordInput {
  source: string;
  signal: string;
  status: SourceOutcome["status"];
  postureScore?: number;
  weight: number;
  /** When the SOURCE itself reports this data as current (e.g. NWS
   * `effective`, NWPS `validTime`, AQICN `time.iso`) -- distinct from
   * `evaluatedAt` on the parent record, which is our own clock. */
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
  /** Our own clock -- when this evaluation was run. Distinct from each
   * input's sourceReportedAt (see module doc). */
  evaluatedAt: string;
  facilityId: string;
  facilityName: string;
  requestedDate: string;
  posture: Posture;
  postureLabel: string;
  recommendedScore: number | null;
  experimentalBlendedScore: number | null;
  rationale: string;
  governmentSourceErrored: boolean;
  inputs: DecisionRecordInput[];
  excludedInputs: DecisionRecordInput[];
  notificationRecipients: DecisionRecordNotificationRecipient[];
  sourceErrors: Array<{ source: string; error: string }>;
}

function ensureDir(): void {
  if (!fs.existsSync(DECISION_RECORDS_DIR)) {
    fs.mkdirSync(DECISION_RECORDS_DIR, { recursive: true });
  }
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
  posture: Posture;
  postureLabel: string;
  recommendedScore: number | null;
  experimentalBlendedScore: number | null;
  rationale: string;
  governmentSourceErrored: boolean;
  scoredSources: SourceOutcome[];
  excludedSources: SourceOutcome[];
  notificationRecipients: DecisionRecordNotificationRecipient[];
  sourceErrors: Array<{ source: string; error: string }>;
}): DecisionRecord {
  return {
    recordId: randomUUID(),
    evaluatedAt: new Date().toISOString(),
    facilityId: params.facilityId,
    facilityName: params.facilityName,
    requestedDate: params.requestedDate,
    posture: params.posture,
    postureLabel: params.postureLabel,
    recommendedScore: params.recommendedScore,
    experimentalBlendedScore: params.experimentalBlendedScore,
    rationale: params.rationale,
    governmentSourceErrored: params.governmentSourceErrored,
    inputs: params.scoredSources.map(toDecisionRecordInput),
    excludedInputs: params.excludedSources.map(toDecisionRecordInput),
    notificationRecipients: params.notificationRecipients,
    sourceErrors: params.sourceErrors,
  };
}

// If a facility's evaluation hasn't materially changed (same posture,
// same recommended score, same government-source-error state) within
// this window, skip persisting a near-duplicate record. Found live,
// 2026-10-11: every dashboard page view/refresh calls /evaluate, which
// was flooding the audit trail with 8-9 near-identical records seconds
// apart during a single viewing session -- defeats the point of a
// trustworthy decision record (a reviewer shouldn't have to wade
// through refresh noise to find actual decision points). A genuinely
// new/changed condition is NEVER deduplicated, regardless of timing.
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

function isMaterialDuplicate(candidate: DecisionRecord, previous: DecisionRecord | undefined): boolean {
  if (!previous) return false;

  const elapsedMs = new Date(candidate.evaluatedAt).getTime() - new Date(previous.evaluatedAt).getTime();
  if (elapsedMs > DEDUP_WINDOW_MS) return false;

  return (
    candidate.posture === previous.posture &&
    candidate.recommendedScore === previous.recommendedScore &&
    candidate.governmentSourceErrored === previous.governmentSourceErrored
  );
}

/** Append a decision record to the JSONL store, unless it's a material
 * duplicate of the facility's most recent record within the dedup
 * window (see constant above). Fire-and-forget-safe: callers should
 * not let a write failure block the HTTP response, but SHOULD log it
 * loudly, since a silently-failing audit trail defeats the entire
 * point of this deliverable.
 *
 * Returns true if a record was actually written, false if skipped as
 * a duplicate -- callers can use this to decide whether to tell the
 * decision-log UI to refresh. */
export function appendDecisionRecord(record: DecisionRecord): boolean {
  ensureDir();

  const previous = getDecisionRecordsForFacility(record.facilityId)[0]; // newest-first
  if (isMaterialDuplicate(record, previous)) {
    return false;
  }

  fs.appendFileSync(DECISION_RECORDS_FILE, JSON.stringify(record) + "\n", "utf-8");
  return true;
}

/** Read all decision records, newest first. Loads the whole file into
 * memory -- fine for a hackathon demo's data volume, would need real
 * pagination/a real DB for production scale. */
export function getAllDecisionRecords(): DecisionRecord[] {
  if (!fs.existsSync(DECISION_RECORDS_FILE)) return [];

  const raw = fs.readFileSync(DECISION_RECORDS_FILE, "utf-8");
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);

  const records: DecisionRecord[] = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
      // A single corrupted line should not take down the whole
      // history view -- skip it, don't throw.
      console.error("Skipping unparseable decision record line");
    }
  }

  return records.reverse();
}

export function getDecisionRecordsForFacility(facilityId: string): DecisionRecord[] {
  return getAllDecisionRecords().filter((r) => r.facilityId === facilityId);
}

export function getDecisionRecordById(recordId: string): DecisionRecord | undefined {
  return getAllDecisionRecords().find((r) => r.recordId === recordId);
}
