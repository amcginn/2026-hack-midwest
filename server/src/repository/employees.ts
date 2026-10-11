/**
 * Employee repository. File-backed (data/synthetic/employees.yaml).
 * See docs/project-scope.md section 1 for the data model rationale
 * (homeFacilityId/remoteStatus describe the norm; day-specific
 * exceptions live in schedule.ts, not here).
 */

import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { Employee } from "./types";
import { SYNTHETIC_DATA_DIR } from "./dataPaths";

interface EmployeesFile {
  employees: Employee[];
}

let cache: Employee[] | undefined;

function loadEmployees(): Employee[] {
  if (cache) return cache;

  const filePath = path.join(SYNTHETIC_DATA_DIR, "employees.yaml");
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = YAML.parse(raw) as EmployeesFile;

  cache = parsed.employees;
  return cache;
}

export function getAllEmployees(): Employee[] {
  return loadEmployees();
}

/** Everyone whose home facility matches, regardless of remoteStatus
 * (full_remote employees are included here -- schedule-aware filtering
 * for "who's actually affected today" happens in applicability.ts, not
 * here. This function answers "who's on the roster," not "who's
 * applicable today.") */
export function getEmployeesByHomeFacility(facilityId: string): Employee[] {
  return loadEmployees().filter((e) => e.homeFacilityId === facilityId);
}

export function getEmployeeById(employeeId: string): Employee | undefined {
  return loadEmployees().find((e) => e.employeeId === employeeId);
}
