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
  /** Our own clock -- when this DECISION was recorded (not when the
   * underlying evaluation data was fetched -- see module doc). */
  evaluatedAt: string;
  facilityId: string;
  facilityName: string;
  requestedDate: string;
  /** The posture actually DECIDED, which may differ from
   * recommendedPosture if a human overrode it -- the challenge is
   * explicit that "the goal is not to automate the decision," so an
   * override is a first-class, expected case, not an edge case. */
  posture: Posture;
  postureLabel: string;
  /** What the system recommended at evaluation time, for comparison
   * against the posture actually decided (above). Null if there was
   * no scored government source to recommend from. */
  recommendedPosture: Posture | null;
  wasOverridden: boolean;
  recommendedScore: number | null;
  experimentalBlendedScore: number | null;
  rationale: string;
  /** Deliverable #2's explicitly-named fields -- see
   * evaluator/explain.ts. Persisted on the record (not just the live
   * /evaluate response) so a reconstructed decision shows the full
   * explanation that was available at the time, not just the
   * rationale paragraph. */
  thresholdCrossed: string;
  confidence: string;
  whatWouldChange: string;
  governmentSourceErrored: boolean;
  inputs: DecisionRecordInput[];
  excludedInputs: DecisionRecordInput[];
  notificationRecipients: DecisionRecordNotificationRecipient[];
  sourceErrors: Array<{ source: string; error: string }>;
  /** Who recorded this decision and any free-text notes -- "the goal
   * is... that whatever they decide reaches the right people fast,"
   * and reconstructability requires knowing a human was in the loop,
   * not just the algorithm's output. */
  decidedBy?: string;
  decisionNotes?: string;
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
  /** The posture actually decided -- defaults to recommendedPosture
   * when the caller doesn't override (see POST /decisions route). */
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
    recordId: randomUUID(),
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

// NOTE (changed 2026-10-11, per user): dedup-by-time-window was the
// wrong model. Decision records are no longer written on every
// evaluation/page-view -- they are only written when a facility
// manager explicitly records a decision (POST /decisions). An explicit
// action never needs deduplicating; every one of them is meaningful by
// definition. (Dedup logic that used to live here was removed, not
// just disabled -- see git history if it's ever needed again.)

/** Append a decision record to the JSONL store. Fire-and-forget-safe:
 * callers should not let a write failure block the HTTP response, but
 * SHOULD log it loudly, since a silently-failing audit trail defeats
 * the entire point of this deliverable. */
export function appendDecisionRecord(record: DecisionRecord): void {
  ensureDir();
  fs.appendFileSync(DECISION_RECORDS_FILE, JSON.stringify(record) + "\n", "utf-8");
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
