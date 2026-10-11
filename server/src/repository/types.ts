/**
 * Domain types for facilities/employees/schedule entries.
 * Mirrors the YAML schemas in data/synthetic/ and
 * docs/project-scope.md section 1.
 */

export interface Address {
  line1: string;
  city: string;
  state: string;
  zip: string;
}

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface Facility {
  facilityId: string;
  name: string;
  address: Address;
  coordinates: Coordinates;
  hours: string;
  buildingType: string;
  accessibilityNotes: string;
  /** USGS site number for the nearest river gauge, if any. NWPS
   * accepts this directly (confirmed 2026-10-11) -- see
   * server/src/sources/usgs.ts. */
  riverGaugeId?: string;
  notes?: string;
}

export type RemoteStatus = "in_office" | "full_remote" | "hybrid";

export interface Employee {
  employeeId: string;
  name: string;
  phone: string;
  email: string;
  role: string;
  homeFacilityId: string;
  remoteStatus: RemoteStatus;
  essentialPersonnel: boolean;
  teleworkEligible: boolean;
  notes?: string;
}

export type ScheduleStatus = "on_detail" | "telework" | "leave" | "in_office_today";

export interface ScheduleEntryItem {
  employeeId: string;
  status: ScheduleStatus;
  locationNote?: string;
}

export interface ScheduleDay {
  date: string; // YYYY-MM-DD
  facilityId: string;
  entries: ScheduleEntryItem[];
}
