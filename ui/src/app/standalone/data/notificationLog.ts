/**
 * Ported from server/src/repository/notificationLog.ts for the
 * standalone (no-backend, GitHub Pages) build. Same localStorage
 * approach as decisionRecords.ts -- see that file's module doc.
 */

const STORAGE_KEY = "facman-standalone:notification-log";

export type NotificationChannel = "email" | "sms";

export interface NotificationLogEntry {
  notificationId: string;
  sentAt: string;
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
}

function readAll(): NotificationLogEntry[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error("Could not parse notification log -- treating as empty, not crashing");
    return [];
  }
}

function writeAll(entries: NotificationLogEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function appendNotificationLogEntries(entries: NotificationLogEntry[]): void {
  const existing = readAll();
  writeAll([...existing, ...entries]);
}

export function getAllNotificationLogEntries(): NotificationLogEntry[] {
  return [...readAll()].reverse();
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
    notificationId: crypto.randomUUID(),
    sentAt: new Date().toISOString(),
    ...params,
  };
}
