/**
 * "Who's applicable at a facility today" rule.
 * See docs/project-scope.md section 1 "Who's applicable at a facility,
 * for a given day" for the full derivation.
 *
 *   applicable = (
 *       employees WHERE homeFacilityId = X AND remoteStatus != full_remote
 *       AND no schedule entry for today with status in {on_detail, telework, leave}
 *     )
 *     UNION (
 *       employees WITH a schedule entry for today, status = in_office_today
 *     )
 *
 * Essential personnel are always included regardless of this rule --
 * reporting requirements don't change with posture (section 1).
 */

import { getEmployeesByHomeFacility, getEmployeeById } from "./employees";
import { getScheduleEntries } from "./schedule";
import type { Employee, ScheduleStatus } from "./types";

export interface ApplicableEmployee {
  employee: Employee;
  /** Why this employee is included: their normal pattern, a schedule
   * exception, or (new, 2026-10-11) essential personnel whose standing
   * reporting requirement applies even though today's schedule would
   * otherwise exclude them (on_detail/telework -- actively working
   * elsewhere, just not at this facility). Surfaced in the decision
   * record for auditability (section 1's "explainable, auditable
   * rule"). */
  reason: "home_facility_normal" | "in_office_today_exception" | "essential_despite_schedule_exception";
  scheduleNote?: string;
}

const EXCLUDING_STATUSES: ScheduleStatus[] = ["on_detail", "telework", "leave"];

export function getApplicableEmployees(facilityId: string, date: string): ApplicableEmployee[] {
  const scheduleEntries = getScheduleEntries(facilityId, date);
  const scheduleByEmployeeId = new Map(scheduleEntries.map((e) => [e.employeeId, e]));

  const result: ApplicableEmployee[] = [];

  // Home-facility employees, minus full_remote, minus anyone excluded
  // by today's schedule.
  for (const employee of getEmployeesByHomeFacility(facilityId)) {
    const scheduleEntry = scheduleByEmployeeId.get(employee.employeeId);

    if (employee.remoteStatus === "full_remote") continue;
    if (scheduleEntry && EXCLUDING_STATUSES.includes(scheduleEntry.status)) continue;

    result.push({ employee, reason: "home_facility_normal" });
  }

  // Anyone with an in_office_today exception, even if normally
  // full_remote or based elsewhere entirely.
  for (const entry of scheduleEntries) {
    if (entry.status !== "in_office_today") continue;

    const employee = getEmployeeById(entry.employeeId);
    if (!employee) continue; // malformed data reference -- skip, don't crash
    if (result.some((r) => r.employee.employeeId === employee.employeeId)) continue; // already included

    result.push({ employee, reason: "in_office_today_exception", scheduleNote: entry.locationNote });
  }

  return result;
}

/**
 * Everyone who must be notified for a facility/date, regardless of
 * posture: the applicable set above, PLUS any essential personnel on
 * the home roster who wouldn't otherwise be included (e.g. an
 * essential employee who is full_remote still needs to know, since
 * their reporting requirement doesn't change with posture).
 *
 * EXCEPTION (fixed 2026-10-11, per user): "leave" is not a facility-
 * posture exception, it's a general not-working-today status --
 * irrelevant to essential-personnel status. An employee on approved
 * leave doesn't need "the facility is closed" news regardless of
 * whether their reporting requirement would otherwise be unaffected
 * by weather, because they're not reporting for an unrelated reason
 * already. `on_detail`/`telework` are different: the employee IS
 * still working that day, just not physically at this facility, so an
 * essential employee's standing requirement still makes sense to
 * surface for those two statuses specifically. Previously this
 * function added every essential employee not already included with
 * NO check of today's schedule at all -- an essential employee on
 * leave was silently notified and labeled identically to someone on
 * their completely normal schedule, with no way to tell the two
 * apart.
 */
export function getNotificationRecipients(facilityId: string, date: string): ApplicableEmployee[] {
  const applicable = getApplicableEmployees(facilityId, date);
  const includedIds = new Set(applicable.map((a) => a.employee.employeeId));

  const scheduleEntries = getScheduleEntries(facilityId, date);
  const scheduleByEmployeeId = new Map(scheduleEntries.map((e) => [e.employeeId, e]));

  const result = [...applicable];

  for (const employee of getEmployeesByHomeFacility(facilityId)) {
    if (!employee.essentialPersonnel) continue;
    if (includedIds.has(employee.employeeId)) continue;

    const scheduleEntry = scheduleByEmployeeId.get(employee.employeeId);
    if (scheduleEntry?.status === "leave") continue; // on leave -- not notified, essential or not

    result.push({
      employee,
      reason: scheduleEntry ? "essential_despite_schedule_exception" : "home_facility_normal",
      scheduleNote: scheduleEntry?.locationNote,
    });
    includedIds.add(employee.employeeId);
  }

  return result;
}
