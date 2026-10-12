/**
 * Drafted notification message templates -- deliverable #3's "a
 * drafted message" requirement. Same templated-not-LLM approach as
 * rationale/templates.ts (small finite combination space: posture band
 * x essential/non-essential x long/short form), for the same reasons
 * (deterministic, no new dependency/latency/cost).
 *
 * DESIGN NOTE (per user, 2026-10-11): the real urgency problem isn't
 * "essential vs non-essential gets a different channel," it's TIMING
 * relative to when someone would otherwise leave the house. Essential
 * personnel's situation never changes regardless of posture -- their
 * message is a single, short, identical reassurance line, not a
 * posture-specific paragraph. Non-essential recipients being told to
 * stay home need to get that message BEFORE they leave -- that's the
 * case that needs a short-form (SMS-length) variant in addition to the
 * long-form email, directly addressing the challenge's "before they've
 * already left the house" framing.
 *
 * Facility name is always stated once, in the opening line -- per user
 * (2026-10-11): someone on detail elsewhere or working an exception
 * schedule needs to know WHICH facility's posture this is about, not
 * assume it's their home base. Not repeated beyond that; if a message
 * doesn't apply to someone because their actual schedule differs from
 * what's assumed, that's on them to recognize, not something the
 * template needs to hedge against.
 */

import type { Posture } from "../evaluator/posture";

/**
 * Formats a plain YYYY-MM-DD date string with the day of week included
 * -- found live, 2026-10-11: a message saying "today, 2026-10-11" with
 * no weekday forces the reader to do date math to confirm it's
 * actually today (or whichever day it claims to be). Two formats,
 * mirroring Angular's date-pipe long/short vocabulary (`date:'full'`
 * vs `date:'short'`) even though this is plain Intl, not the pipe --
 * same idea, applied where the pipe itself doesn't reach (this text is
 * backend-generated message content, not a template binding).
 *
 * Parsed as UTC-noon rather than midnight to avoid an off-by-one
 * weekday near UTC day boundaries in timezones behind UTC (a plain
 * `new Date("2026-10-11")` is midnight UTC, which is still the
 * PREVIOUS day in e.g. US timezones -- not what we want when the
 * input is a plain calendar date with no time/zone info of its own).
 */
function formatLongDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  return date.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
}

function formatShortDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  return date.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
}

export interface NotificationMessages {
  /** Full email-length message. Always includes the facility name,
   * posture, driving signal, (for essential recipients) the
   * unchanged-schedule line, and the accommodation-disclaimer line. */
  longForm: string;
  /** SMS-length message. Every posture (including "normal," added
   * 2026-10-13 per user -- "even a targeted individual message
   * confirming the office is open today" is worth sending) now has a
   * real short form. */
  shortForm: string | null;
}

const ESSENTIAL_LINE = "ESSENTIAL PERSONNEL: This does not change your schedule or reporting requirement.";

/**
 * Blanket disclaimer appended to every long-form message, regardless
 * of posture or recipient -- per user, 2026-10-13: deliberately
 * identical for everyone, not conditioned on any individual's
 * accessibilityNotes field. Branching message content on a specific
 * person's accommodation data would be the system "taking action" on
 * that data, which Employee.accessibilityNotes is explicitly NOT
 * supposed to drive (see server/src/repository/types.ts module doc).
 * A universal reminder doesn't single anyone out or read as the
 * system making any individual determination -- it just states a
 * limitation of the recommendation itself, true for every reader.
 */
const ACCOMMODATION_DISCLAIMER_LINE =
  "If you or someone you supervise has an accessibility or individual accommodation need affected by today's conditions, address that directly — this recommendation does not account for it.";

/**
 * Build both message variants for one recipient.
 *
 * @param facilityName  Always stated once in the opening line (section
 *   1 "driving signal" / disambiguation rule above).
 * @param posture       The DECIDED posture (not necessarily the
 *   system's recommendation -- a human may have overridden it; the
 *   notification should reflect what was actually decided).
 * @param date          The date this applies to (decision record's
 *   `requestedDate` / the dashboard's decision-date field).
 * @param drivingSignal Human-readable signal name (e.g. "a Winter
 *   Storm Warning") driving the posture, or undefined for "normal"/
 *   when there's no scored driving source.
 * @param essentialPersonnel  Whether THIS recipient is essential --
 *   determines whether the unchanged-schedule line is included at all.
 */
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
        longForm: buildLongForm(
          `USDA Weather Facility Update — ${facilityName}`,
          `${facilityName} is operating normally on ${longDate}. No weather-related closures or schedule changes are in effect. If your status changes, you will be notified.`,
          essentialPersonnel,
        ),
        shortForm: `${facilityName}: Operating normally ${shortDate}. No closures or schedule changes in effect.`,
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
        longForm: buildLongForm(
          `USDA Weather Facility Update — ${facilityName} — Status Unknown`,
          `${facilityName}'s status could not be automatically determined for ${longDate}, because the primary weather data source could not be reached. Please check with your supervisor before heading in, and watch for a follow-up update.`,
          essentialPersonnel,
        ),
        shortForm: `${facilityName}: Status unknown ${shortDate} (data source issue). Check with your supervisor before heading in.`,
      };
  }
}

function buildLongForm(headerLine: string, bodyLine: string, essentialPersonnel: boolean): string {
  const essentialBlock = essentialPersonnel ? `\n\n${ESSENTIAL_LINE}` : "";
  return `${headerLine}\n\n${bodyLine}${essentialBlock}\n\n${ACCOMMODATION_DISCLAIMER_LINE}`;
}
