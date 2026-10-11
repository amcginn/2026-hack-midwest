/**
 * Generic contract for supplemental (non-NWS) data sources.
 *
 * NWS is intentionally NOT behind this interface -- it's explicitly
 * named as "the core source" in the challenge text and is the only
 * source that ever drives the recommended posture (see
 * evaluator/aggregate.ts). It's called directly in runEvaluation.
 *
 * Everything else (USGS/NWPS, AQICN, and any future source -- DOT
 * road conditions, power outage reporting, etc.) implements this
 * interface instead of being wired in by hand. Adding a new
 * supplemental source means writing one adapter object and pushing it
 * into the `supplementalAdapters` array in index.ts -- no changes to
 * the evaluation control flow, and no parallel index-aligned arrays
 * (the old `sourceNames` array indexed against `Promise.allSettled`
 * results was exactly this kind of fragility: adding a source in the
 * wrong array position silently mislabeled error messages).
 *
 * Each adapter still returns its own source-specific `detail` fields
 * inside the shared SourceOutcome shape (section 2/3) -- this
 * interface standardizes *invocation and applicability*, not the
 * payload itself. Different sources will always carry different
 * concepts (gauge height vs. AQI vs. road condition code); forcing a
 * single detail schema across them isn't the goal.
 */

import type { Facility } from "../repository/types";
import type { SourceOutcome } from "./types";

export interface SupplementalAdapter {
  /** Matches the `source` field this adapter's outcomes report, used
   * for error labeling when the adapter's evaluate() call rejects. */
  name: string;
  /** Whether this adapter has enough facility configuration to run at
   * all (e.g. USGS only runs if the facility has a riverGaugeId).
   * Adapters that apply unconditionally (e.g. AQICN, which only needs
   * lat/lon every facility already has) should always return true. */
  isApplicable(facility: Facility): boolean;
  /** Fetch and score this source for the given facility. May throw --
   * callers are expected to wrap in Promise.allSettled. */
  evaluate(facility: Facility): Promise<SourceOutcome[]>;
}
