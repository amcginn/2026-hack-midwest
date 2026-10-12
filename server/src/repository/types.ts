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
  /** Per-employee working hours, when they differ from the facility's
   * posted hours (e.g. a field ranger whose actual schedule runs
   * earlier/later than the office's 8-5) -- display only, does not
   * affect scoring/applicability. Per user, 2026-10-13: the original
   * challenge text's "facility model" sentence ("location, hours,
   * employee assignments, essential-personnel flags, telework
   * eligibility, accessibility needs") actually describes several
   * per-EMPLOYEE attributes despite being filed under "facility" --
   * hours is one of them when a role's actual schedule doesn't match
   * the building's posted hours. */
  workHours?: string;
  /** Per-employee accessibility accommodation note -- same source
   * ("accessibility needs" in the original challenge text) as
   * Facility.accessibilityNotes, but genuinely a different concept:
   * that field describes the BUILDING (e.g. "ground-floor ADA
   * accessible"); this describes something specific to the PERSON
   * (e.g. a mobility accommodation that makes a particular day's
   * conditions harder for them even when the facility overall is
   * open). Purely informational -- per user: "notes are purely
   * data-model, not something to take actual action on through
   * logic." Deliberately does NOT feed scoring/posture/notification
   * wording; it's context a facility manager can see and act on
   * themselves on a case-by-case basis (e.g. approving ad hoc
   * telework for just that person without changing the facility's
   * overall posture). */
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
  date: string; // YYYY-MM-DD
  facilityId: string;
  entries: ScheduleEntryItem[];
}
