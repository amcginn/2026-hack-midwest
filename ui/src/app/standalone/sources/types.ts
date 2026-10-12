/**
 * Ported from server/src/sources/types.ts. See posture.ts port's
 * module doc for why this is a port, not a shared import.
 */

export type SourceStatus = "scored" | "insufficient_data" | "narrative" | "absent" | "not_included_in_this_build";

export type SourceTier = "government" | "supplemental" | "narrative";

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
