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

export type Posture = 'normal' | 'delay' | 'early_dismissal' | 'telework_unscheduled_leave' | 'closure';

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
