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
  phone: string;
  email: string;
  essentialPersonnel: boolean;
  reason: 'home_facility_normal' | 'in_office_today_exception';
  longFormMessage: string;
  shortFormMessage: string | null;
}

export type NotificationChannel = 'email' | 'sms';

export interface NotificationLogEntry {
  notificationId: string;
  sentAt: string;
  facilityId: string;
  facilityName: string;
  decisionRecordId: string | null;
  posture: Posture;
  postureLabel: string;
  employeeId: string;
  employeeName: string;
  essentialPersonnel: boolean;
  channel: NotificationChannel;
  messageText: string;
  sentViaBulkAction: boolean;
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
  recommendedPosture: Posture | null;
  wasOverridden: boolean;
  recommendedScore: number | null;
  experimentalBlendedScore: number | null;
  rationale: string;
  thresholdCrossed: string;
  confidence: string;
  whatWouldChange: string;
  governmentSourceErrored: boolean;
  inputs: DecisionRecordInput[];
  excludedInputs: DecisionRecordInput[];
  notificationRecipients: NotificationRecipient[];
  sourceErrors: SourceError[];
  decidedBy?: string;
  decisionNotes?: string;
}

export interface FacilityLink {
  id: string;
  label: string;
  url: string;
}

export interface FacilityEvaluation {
  facilityId: string;
  facilityName: string;
  facility: {
    address: Address;
    hours: string;
    buildingType: string;
    accessibilityNotes: string;
    customLinks: FacilityLink[];
  };
  date: string;
  posture: Posture;
  postureLabel: string;
  noGovernmentDataAvailable: boolean;
  recommendedScore: number | null;
  experimentalBlendedScore: number | null;
  rationale: string;
  thresholdCrossed: string;
  confidence: string;
  whatWouldChange: string;
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
