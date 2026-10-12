/**
 * Ported from server/src/repository/types.ts.
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
  /** See server/src/repository/types.ts Employee.workHours module doc
   * for why this exists on the employee, not the facility. */
  workHours?: string;
  /** See server/src/repository/types.ts Employee.accessibilityNotes
   * module doc -- purely informational, no scoring/notification
   * logic reads this. */
  accessibilityNotes?: string;
  notes?: string;
}

export type ScheduleStatus = "on_detail" | "telework" | "leave" | "in_office_today";

export interface ScheduleEntryItem {
  employeeId: string;
  status: ScheduleStatus;
  locationNote?: string;
}

export interface ScheduleDay {
  date: string;
  facilityId: string;
  entries: ScheduleEntryItem[];
}
