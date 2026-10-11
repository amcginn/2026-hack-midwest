/**
 * Mirrors server/src/repository/types.ts and the response shape of
 * GET /api/facilities and GET /api/facilities/:id/evaluate.
 * Kept in sync by hand for the hackathon -- see
 * docs/project-scope.md section 6 Open Questions re: codegen target.
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

export type SourceStatus = 'scored' | 'insufficient_data' | 'narrative' | 'absent';
export type SourceTier = 'government' | 'supplemental' | 'narrative';

export interface SourceOutcome {
  source: string;
  tier: SourceTier;
  signal: string;
  status: SourceStatus;
  postureScore?: number;
  weight: number;
  detail: Record<string, unknown>;
  note?: string;
  timestamp: string;
  rawRef?: string;
}

export type Posture =
  | 'normal'
  | 'delay'
  | 'early_dismissal'
  | 'telework_unscheduled_leave'
  | 'closure'
  | 'unknown';

export interface NotificationRecipient {
  employeeId: string;
  name: string;
  essentialPersonnel: boolean;
  reason: 'home_facility_normal' | 'in_office_today_exception';
}

export interface SourceError {
  source: string;
  error: string;
}

export interface RosterEmployee {
  employeeId: string;
  name: string;
  role: string;
  remoteStatus: 'in_office' | 'full_remote' | 'hybrid';
  essentialPersonnel: boolean;
  teleworkEligible: boolean;
  todayStatus: string;
  scheduleNote?: string;
  applicableToday: boolean;
}

export interface FacilityRoster {
  facilityId: string;
  date: string;
  rosterCount: number;
  roster: RosterEmployee[];
}

export interface DecisionRecordInput {
  source: string;
  signal: string;
  status: SourceStatus;
  postureScore?: number;
  weight: number;
  sourceReportedAt: string;
  note?: string;
  detail: Record<string, unknown>;
}

export interface DecisionRecord {
  recordId: string;
  evaluatedAt: string;
  facilityId: string;
  facilityName: string;
  requestedDate: string;
  posture: Posture;
  postureLabel: string;
  recommendedScore: number | null;
  experimentalBlendedScore: number | null;
  rationale: string;
  governmentSourceErrored: boolean;
  inputs: DecisionRecordInput[];
  excludedInputs: DecisionRecordInput[];
  notificationRecipients: NotificationRecipient[];
  sourceErrors: SourceError[];
}

export interface FacilityEvaluation {
  facilityId: string;
  facilityName: string;
  date: string;
  posture: Posture;
  postureLabel: string;
  recommendedScore: number | null;
  experimentalBlendedScore: number | null;
  rationale: string;
  sources: {
    government: SourceOutcome[];
    supplemental: SourceOutcome[];
    excluded: SourceOutcome[];
  };
  notification: {
    recipientCount: number;
    recipients: NotificationRecipient[];
  };
  sourceErrors: SourceError[];
}
