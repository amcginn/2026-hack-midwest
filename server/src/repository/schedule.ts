/**
 * Daily schedule-entry repository. File-backed
 * (data/synthetic/schedule-entries.yaml). Only exceptions to an
 * employee's normal homeFacilityId/remoteStatus are stored -- see
 * docs/project-scope.md section 1.
 */

import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { ScheduleDay, ScheduleEntryItem } from "./types";
import { SYNTHETIC_DATA_DIR } from "./dataPaths";

interface ScheduleFile {
  schedules: ScheduleDay[];
}

let cache: ScheduleDay[] | undefined;

function loadSchedule(): ScheduleDay[] {
  if (cache) return cache;

  const filePath = path.join(SYNTHETIC_DATA_DIR, "schedule-entries.yaml");
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = YAML.parse(raw) as ScheduleFile;

  cache = parsed.schedules;
  return cache;
}

/**
 * Get the schedule exceptions for a specific facility and date.
 * Returns an empty array if there's no entry for that day (everyone
 * follows their normal pattern) -- callers should treat "no entries"
 * and "no schedule day record at all" identically.
 */
export function getScheduleEntries(facilityId: string, date: string): ScheduleEntryItem[] {
  const day = loadSchedule().find((d) => d.facilityId === facilityId && d.date === date);
  return day?.entries ?? [];
}
