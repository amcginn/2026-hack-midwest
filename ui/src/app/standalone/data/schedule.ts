/**
 * Ported from data/synthetic/schedule-entries.yaml.
 *
 * NOTE: these entries are pinned to the specific date they were
 * originally authored for (2026-10-11), which will not be "today" for
 * most people running this build. This means the schedule-exception
 * demo cases (on_detail/telework/in_office_today) won't actually
 * trigger unless someone requests that exact historical date. This is
 * a known, accepted limitation of the standalone build -- the full
 * client/server version doesn't have this problem since its data can
 * be edited to match "today" by whoever's running it. Not fixed here
 * because inventing a "shift all dates to always be relative to today"
 * scheme adds real complexity for a demo-only build; if revisited,
 * the straightforward fix is computing these relative to
 * `new Date()` at load time instead of a fixed ISO string.
 */

import type { ScheduleDay } from "./types";

export const SCHEDULE_DAYS: ScheduleDay[] = [
  {
    date: "2026-10-11",
    facilityId: "USDA-FSA-IA-CLINTON",
    entries: [
      { employeeId: "E1003", status: "on_detail", locationNote: "Billings, MT field office this week" },
      { employeeId: "E1004", status: "telework" },
      { employeeId: "E1006", status: "in_office_today", locationNote: "Normally fully remote; in office today for a quarterly review" },
    ],
  },
];

export function getScheduleEntries(facilityId: string, date: string) {
  const day = SCHEDULE_DAYS.find((d) => d.facilityId === facilityId && d.date === date);
  return day?.entries ?? [];
}
