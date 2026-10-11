/**
 * Shared types for data source adapters.
 * Mirrors docs/project-scope.md sections 2-4.
 */

export type SourceStatus = "scored" | "insufficient_data" | "narrative" | "absent";

export type SourceTier = "government" | "supplemental" | "narrative";

/**
 * The common structured result every scored/insufficient-data source
 * adapter returns, before aggregation (section 3).
 */
export interface SourceOutcome {
  source: string;
  tier: SourceTier;
  signal: string;
  status: SourceStatus;
  /** 0-4 posture-pressure score. Omitted entirely when status is
   * "insufficient_data", "narrative", or "absent" -- per section 2's
   * "absence is not evidence of normalcy" rule, these are never
   * defaulted to 0 and must be excluded from aggregation, not included
   * as a zero value. */
  postureScore?: number;
  /** Weight used in the weighted-average aggregation (section 4).
   * Narrative/absent sources have weight 0 and are excluded regardless. */
  weight: number;
  /** Human-readable supporting detail (severity/certainty/urgency for
   * NWS, raw value + reference for numeric sources, free text for
   * narrative sources). */
  detail: Record<string, unknown>;
  /** Plain-language note surfaced alongside the score (e.g. urgency
   * qualifier, or an explanation for why a source is insufficient_data). */
  note?: string;
  timestamp: string;
  rawRef?: string;
}
