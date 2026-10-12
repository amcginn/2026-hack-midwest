/**
 * Ported from data/synthetic/employees.yaml. See facilities.ts port's
 * module doc for why this is a static TS module.
 */

import type { Employee } from "./types";

export const EMPLOYEES: Employee[] = [
  { employeeId: "E1001", name: "Jordan Rivera", phone: "555-0100", email: "jordan.rivera@example.gov", role: "Soil Conservationist", homeFacilityId: "USDA-FSA-IA-CLINTON", remoteStatus: "in_office", essentialPersonnel: false, teleworkEligible: true },
  { employeeId: "E1002", name: "Pat Nguyen", phone: "555-0101", email: "pat.nguyen@example.gov", role: "Facility Manager", homeFacilityId: "USDA-FSA-IA-CLINTON", remoteStatus: "in_office", essentialPersonnel: true, teleworkEligible: false },
  { employeeId: "E1003", name: "Avery Collins", phone: "555-0102", email: "avery.collins@example.gov", role: "Program Technician", homeFacilityId: "USDA-FSA-IA-CLINTON", remoteStatus: "in_office", essentialPersonnel: false, teleworkEligible: true },
  { employeeId: "E1004", name: "Morgan Lee", phone: "555-0103", email: "morgan.lee@example.gov", role: "District Conservationist", homeFacilityId: "USDA-FSA-IA-CLINTON", remoteStatus: "hybrid", essentialPersonnel: false, teleworkEligible: true },
  { employeeId: "E1005", name: "Sam Okafor", phone: "555-0104", email: "sam.okafor@example.gov", role: "Forestry Technician", homeFacilityId: "USDA-FS-MT-BILLINGS", remoteStatus: "in_office", essentialPersonnel: true, teleworkEligible: false },
  { employeeId: "E1006", name: "Taylor Brooks", phone: "555-0105", email: "taylor.brooks@example.gov", role: "Program Analyst", homeFacilityId: "USDA-FSA-IA-CLINTON", remoteStatus: "full_remote", essentialPersonnel: false, teleworkEligible: true },
  { employeeId: "E1007", name: "Casey Whitfield", phone: "555-0106", email: "casey.whitfield@example.gov", role: "State Executive Director", homeFacilityId: "USDA-FSA-IA-DESMOINES", remoteStatus: "in_office", essentialPersonnel: true, teleworkEligible: false },
  { employeeId: "E1008", name: "Riley Nakamura", phone: "555-0107", email: "riley.nakamura@example.gov", role: "Loan Officer", homeFacilityId: "USDA-FSA-IA-DESMOINES", remoteStatus: "hybrid", essentialPersonnel: false, teleworkEligible: true },
  { employeeId: "E1009", name: "Dakota Finch", phone: "555-0108", email: "dakota.finch@example.gov", role: "Forestry Technician", homeFacilityId: "USDA-FS-MT-GREATFALLS", remoteStatus: "in_office", essentialPersonnel: false, teleworkEligible: true },
  { employeeId: "E1010", name: "Harper Delgado", phone: "555-0109", email: "harper.delgado@example.gov", role: "Facility Manager", homeFacilityId: "USDA-FS-MT-GREATFALLS", remoteStatus: "in_office", essentialPersonnel: true, teleworkEligible: false },
  { employeeId: "E1011", name: "Reese Alvarado", phone: "555-0110", email: "reese.alvarado@example.gov", role: "Soil Conservationist", homeFacilityId: "USDA-FSA-CA-SANDIEGO", remoteStatus: "in_office", essentialPersonnel: false, teleworkEligible: true },
  { employeeId: "E1012", name: "Jamie Okonkwo", phone: "555-0111", email: "jamie.okonkwo@example.gov", role: "Facility Manager", homeFacilityId: "USDA-FSA-CA-SANDIEGO", remoteStatus: "in_office", essentialPersonnel: true, teleworkEligible: false },
  { employeeId: "E1013", name: "Skylar Petrov", phone: "555-0112", email: "skylar.petrov@example.gov", role: "Forestry Technician", homeFacilityId: "USDA-FS-OR-PENDLETON", remoteStatus: "in_office", essentialPersonnel: false, teleworkEligible: true, workHours: "05:30-14:00 (field patrol, earlier than station hours)" },
  { employeeId: "E1014", name: "Rowan Kessler", phone: "555-0113", email: "rowan.kessler@example.gov", role: "District Ranger", homeFacilityId: "USDA-FS-OR-PENDLETON", remoteStatus: "in_office", essentialPersonnel: true, teleworkEligible: false },
  { employeeId: "E1015", name: "Morgan Ellis", phone: "555-0114", email: "morgan.ellis@example.gov", role: "Program Technician", homeFacilityId: "USDA-FSA-MO-KANSASCITY", remoteStatus: "in_office", essentialPersonnel: false, teleworkEligible: true },
  { employeeId: "E1016", name: "Devon Marsh", phone: "555-0115", email: "devon.marsh@example.gov", role: "Facility Manager", homeFacilityId: "USDA-FSA-MO-KANSASCITY", remoteStatus: "in_office", essentialPersonnel: true, teleworkEligible: false, accessibilityNotes: "Uses a mobility device; relies on the accessible ramp entrance being cleared/de-iced." },
];

export function getEmployeesByHomeFacility(facilityId: string): Employee[] {
  return EMPLOYEES.filter((e) => e.homeFacilityId === facilityId);
}

export function getEmployeeById(employeeId: string): Employee | undefined {
  return EMPLOYEES.find((e) => e.employeeId === employeeId);
}
