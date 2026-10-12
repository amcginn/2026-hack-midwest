/**
 * Ported from server/src/sources/supplementalAdapter.ts.
 */

import type { Facility } from "../data/types";
import type { SourceOutcome } from "./types";

export interface SupplementalAdapter {
  name: string;
  isApplicable(facility: Facility): boolean;
  evaluate(facility: Facility): Promise<SourceOutcome[]>;
}
