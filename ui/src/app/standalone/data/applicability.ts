/**
 * Ported from server/src/repository/applicability.ts.
 */

import { getEmployeesByHomeFacility, getEmployeeById } from "./employees";
import { getScheduleEntries } from "./schedule";
import type { Employee, ScheduleStatus } from "./types";

export interface ApplicableEmployee {
  employee: Employee;
  reason: "home_facility_normal" | "in_office_today_exception" | "essential_despite_schedule_exception";
  scheduleNote?: string;
}

const EXCLUDING_STATUSES: ScheduleStatus[] = ["on_detail", "telework", "leave"];

export function getApplicableEmployees(facilityId: string, date: string): ApplicableEmployee[] {
  const scheduleEntries = getScheduleEntries(facilityId, date);
  const scheduleByEmployeeId = new Map(scheduleEntries.map((e) => [e.employeeId, e]));

  const result: ApplicableEmployee[] = [];

  for (const employee of getEmployeesByHomeFacility(facilityId)) {
    const scheduleEntry = scheduleByEmployeeId.get(employee.employeeId);

    if (employee.remoteStatus === "full_remote") continue;
    if (scheduleEntry && EXCLUDING_STATUSES.includes(scheduleEntry.status)) continue;

    result.push({ employee, reason: "home_facility_normal" });
  }

  for (const entry of scheduleEntries) {
    if (entry.status !== "in_office_today") continue;

    const employee = getEmployeeById(entry.employeeId);
    if (!employee) continue;
    if (result.some((r) => r.employee.employeeId === employee.employeeId)) continue;

    result.push({ employee, reason: "in_office_today_exception", scheduleNote: entry.locationNote });
  }

  return result;
}

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
    if (scheduleEntry?.status === "leave") continue;

    result.push({
      employee,
      reason: scheduleEntry ? "essential_despite_schedule_exception" : "home_facility_normal",
      scheduleNote: scheduleEntry?.locationNote,
    });
    includedIds.add(employee.employeeId);
  }

  return result;
}
