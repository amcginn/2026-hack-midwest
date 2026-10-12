/**
 * Ported from server/src/notification/templates.ts.
 */

import type { Posture } from "../evaluator/posture";

function formatLongDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  return date.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
}

function formatShortDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  return date.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
}

export interface NotificationMessages {
  longForm: string;
  shortForm: string | null;
}

const ESSENTIAL_LINE = "ESSENTIAL PERSONNEL: This does not change your schedule or reporting requirement.";

export function buildNotificationMessages(
  facilityName: string,
  posture: Posture,
  date: string,
  drivingSignal: string | undefined,
  essentialPersonnel: boolean,
): NotificationMessages {
  const signalText = drivingSignal ?? "current conditions";
  const longDate = formatLongDate(date);
  const shortDate = formatShortDate(date);

  switch (posture) {
    case "normal":
      return {
        longForm:
          `USDA Weather Facility Update — ${facilityName}\n\n` +
          `${facilityName} is operating normally on ${longDate}. No weather-related closures or schedule changes are in effect. If your status changes, you will be notified.`,
        shortForm: null,
      };

    case "delay":
      return {
        longForm: buildLongForm(
          `USDA Weather Facility Update — ${facilityName}`,
          `${facilityName} is on a delayed arrival schedule on ${longDate}, due to ${signalText}. Report at a later time — watch for a follow-up update instead of your normal start time.`,
          essentialPersonnel,
        ),
        shortForm: `${facilityName}: Delayed arrival ${shortDate} due to ${signalText}. Do not report at normal time — watch for update.`,
      };

    case "early_dismissal":
      return {
        longForm: buildLongForm(
          `USDA Weather Facility Update — ${facilityName}`,
          `${facilityName} will dismiss early on ${longDate}, due to ${signalText}. Plan to leave early — watch for a follow-up update with a specific time.`,
          essentialPersonnel,
        ),
        shortForm: `${facilityName}: Early dismissal ${shortDate} due to ${signalText}. Plan to leave early.`,
      };

    case "telework_unscheduled_leave":
      return {
        longForm: buildLongForm(
          `USDA Weather Facility Update — ${facilityName} — Do not report in person`,
          `${facilityName} is shifting to telework/unscheduled leave on ${longDate}, due to ${signalText}. **Do not report to ${facilityName} in person.** If you are telework-eligible, work from home as normal. If you are not telework-eligible, this is excused unscheduled leave.`,
          essentialPersonnel,
        ),
        shortForm: `${facilityName}: Telework/unscheduled leave ${shortDate} due to ${signalText}. Do NOT report in person.`,
      };

    case "closure":
      return {
        longForm: buildLongForm(
          `USDA Weather Facility Update — ${facilityName} — CLOSED today`,
          `${facilityName} is closed on ${longDate}, due to ${signalText}. **Do not report to ${facilityName}.**`,
          essentialPersonnel,
        ),
        shortForm: `${facilityName}: CLOSED ${shortDate} due to ${signalText}. Do NOT report.`,
      };

    case "unknown":
      return {
        longForm:
          `USDA Weather Facility Update — ${facilityName} — Status Unknown\n\n` +
          `${facilityName}'s status could not be automatically determined for ${longDate}, because the primary weather data source could not be reached. Please check with your supervisor before heading in, and watch for a follow-up update.`,
        shortForm: `${facilityName}: Status unknown ${shortDate} (data source issue). Check with your supervisor before heading in.`,
      };
  }
}

function buildLongForm(headerLine: string, bodyLine: string, essentialPersonnel: boolean): string {
  const essentialBlock = essentialPersonnel ? `\n\n${ESSENTIAL_LINE}` : "";
  return `${headerLine}\n\n${bodyLine}${essentialBlock}`;
}
