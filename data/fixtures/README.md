# Data Source Fixtures

Captured real responses from each data source during scoping/investigation
(2026-10-10), used for:
- Documenting actual field shapes (evidence, not just prose claims in
  `docs/project-scope.md`)
- Local test fixtures for building the evaluator without hitting live
  APIs on every run
- A record of what a "normal" vs "active hazard" response looks like

Each file is a real captured response (trimmed/annotated where noted), not
synthetic/fabricated data. Synthetic data (facility profiles, employee
rosters) lives in `data/synthetic/` instead — kept separate so it's always
clear which files are "real API evidence" vs "data we authored."

| File | Source | What it shows |
|---|---|---|
| `nws-alert-flood-warning-ia.yaml` | NWS Alerts API | Live Flood Warning, Clinton/Scott Co. IA, `Severe/Observed/Immediate` |
| `nws-alert-winter-storm-mt.yaml` | NWS Alerts API | Live Winter Storm Warning, Montana, `Severe/Likely/Expected` |
| `nws-alert-tornado-warning-cleared.yaml` | NWS Alerts API | The Aiken/Lexington/Saluda SC Tornado Warning observed earlier in scoping has since **cleared** (empty `features: []` by the time this was captured) — kept intentionally as an example of a normal "no active alert" response. See decision log for the original `Extreme/Observed/Immediate` values that were observed live before it cleared. |
| `nws-alert-air-quality-unknown.yaml` | NWS Alerts API | Live Air Quality Alert showing `Unknown/Unknown/Unknown` — the insufficient-data case |
| `nws-points-clinton-ia.yaml` | NWS `/points` | lat/lon -> county/forecastZone resolution for Clinton, IA |
| `nhc-current-storms.yaml` | NHC `CurrentStorms.json` | Post-Tropical Cyclone Isaias (AL) + Tropical Storm Rachel (EP) |
| `usgs-gauge-clinton-ia.yaml` | USGS Water Services | Live Mississippi River gauge height at Clinton, IA (9.86 ft) |
| `aqicn-clinton-ia.yaml` | AQICN | Live AQI + sub-indices for Clinton, IA (AQI 64) |
| `ia-dot-road-conditions.yaml` | Iowa DOT CARS511 (ArcGIS) | Schema + live sample, all segments at code `10`/"Seasonal" (normal) |
| `ga-511-alerts.yaml` | GA 511 | Live unstructured alert text, incl. Hurricane Isaias road-impact notice |
| `kdkd-clinton-ia-closings.yaml` | KDKD (mykdkd.com) | Live school/business closings list for Clinton, IA area. `{"count":"0","list":[]}` at capture time (no active closures). Narrative-only, custom per-facility source — see docs/project-scope.md section 1/4. Requires a `chkClo` token scraped from the public closings page, not session-bound. |

All captured 2026-10-10. Live public data changes constantly — these are
snapshots for reference/testing, not assumed to stay accurate; re-fetch
live during the actual demo.
