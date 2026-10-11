/**
 * Notification send-log persistence -- deliverable #3's "channel
 * routing" + the audit trail the user asked for alongside it
 * (2026-10-11): "I'd say audit as a separate log" -- NOT folded into
 * the decision record itself. A facility manager might record a
 * decision now and send notifications in a separate action/later
 * moment, so tying them together too tightly could misrepresent when
 * notification actually happened.
 *
 * Each entry links back to the decisionRecordId it was sent under (if
 * any -- see "Notify" button design below) but is its own independent,
 * append-only record. Same JSONL-file pattern as
 * repository/decisionRecord.ts, for the same reasons (no DB needed for
 * the hackathon, trivially greppable/reconstructable by hand).
 *
 * SEND MECHANISM (per user, 2026-10-11): "let's start out with just
 * logged. if we have time, we can set things up in our demo aws
 * account" -- no real email/SMS dispatch yet. This log IS the "send":
 * recording that a human clicked Notify/Notify All and exactly what
 * message+channel was shown for each recipient at that moment.
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const NOTIFICATION_LOG_DIR = path.resolve(__dirname, "../../../data/notification-log");
const NOTIFICATION_LOG_FILE = path.join(NOTIFICATION_LOG_DIR, "notifications.jsonl");

export type NotificationChannel = "email" | "sms";

export interface NotificationLogEntry {
  notificationId: string;
  /** Our own clock -- when this notification action was recorded. */
  sentAt: string;
  facilityId: string;
  facilityName: string;
  /** The decision record this notification was sent under, if the
   * facility manager had already recorded one. Nullable: notifying
   * and deciding are separate actions (see module doc) -- a manager
   * could in principle notify before formally recording the decision,
   * though the UI's primary path is "record decision, then notify." */
  decisionRecordId: string | null;
  posture: string;
  postureLabel: string;
  employeeId: string;
  employeeName: string;
  essentialPersonnel: boolean;
  channel: NotificationChannel;
  /** The exact message text shown/logged for this recipient at send
   * time -- reconstructability matters here too, same as decision
   * records: what was actually sent, not just what the current
   * template would produce if asked again later. */
  messageText: string;
  /** True if this entry came from a "Notify All" bulk action rather
   * than an individual per-row Notify click -- distinguishes bulk vs.
   * targeted sends in the audit trail without needing a separate table. */
  sentViaBulkAction: boolean;
}

function ensureDir(): void {
  if (!fs.existsSync(NOTIFICATION_LOG_DIR)) {
    fs.mkdirSync(NOTIFICATION_LOG_DIR, { recursive: true });
  }
}

export function appendNotificationLogEntries(entries: NotificationLogEntry[]): void {
  ensureDir();
  const lines = entries.map((e) => JSON.stringify(e) + "\n").join("");
  fs.appendFileSync(NOTIFICATION_LOG_FILE, lines, "utf-8");
}

/** Read all notification log entries, newest first. Loads the whole
 * file into memory -- fine for hackathon demo data volume, same
 * tradeoff as decisionRecord.ts. */
export function getAllNotificationLogEntries(): NotificationLogEntry[] {
  if (!fs.existsSync(NOTIFICATION_LOG_FILE)) return [];

  const raw = fs.readFileSync(NOTIFICATION_LOG_FILE, "utf-8");
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);

  const entries: NotificationLogEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      console.error("Skipping unparseable notification log line");
    }
  }

  return entries.reverse();
}

export function getNotificationLogForFacility(facilityId: string): NotificationLogEntry[] {
  return getAllNotificationLogEntries().filter((e) => e.facilityId === facilityId);
}

export function buildNotificationLogEntry(params: {
  facilityId: string;
  facilityName: string;
  decisionRecordId: string | null;
  posture: string;
  postureLabel: string;
  employeeId: string;
  employeeName: string;
  essentialPersonnel: boolean;
  channel: NotificationChannel;
  messageText: string;
  sentViaBulkAction: boolean;
}): NotificationLogEntry {
  return {
    notificationId: randomUUID(),
    sentAt: new Date().toISOString(),
    ...params,
  };
}
