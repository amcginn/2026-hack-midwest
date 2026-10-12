/**
 * AQICN placeholder for the standalone (no-backend, GitHub Pages)
 * build. The full client/server version calls the real AQICN API with
 * a token kept server-side (see server/src/sources/aqicn.ts) -- that
 * token can't ship in this build's client-side JS, where anyone
 * opening dev tools could read and reuse it (per user, 2026-10-12:
 * "keeping secrets out of the client side is the better approach").
 *
 * This is NOT the same as a failed/missing-config call -- there's a
 * dedicated status (`not_included_in_this_build`, see sources/types.ts)
 * distinct from `insufficient_data` (which means "we called this
 * source and it gave us nothing usable") specifically so the UI can
 * describe this as a real, present capability that simply isn't
 * wired up in THIS build, not an error or a setup gap to fix.
 */

import type { SourceOutcome } from "./types";
import type { SupplementalAdapter } from "./supplementalAdapter";

export function buildAqicnPlaceholder(): SourceOutcome {
  return {
    source: "AQICN",
    tier: "supplemental",
    signal: "Air Quality",
    status: "not_included_in_this_build",
    weight: 0.4,
    detail: {},
    note:
      "Air quality monitoring is part of the full version of this app, available in the client/server build. " +
      "It isn't included in this self-contained build so no API credential has to ship in client-side code.",
    timestamp: new Date().toISOString(),
  };
}

export const aqicnAdapter: SupplementalAdapter = {
  name: "AQICN",
  isApplicable: () => true,
  evaluate: async () => [buildAqicnPlaceholder()],
};
