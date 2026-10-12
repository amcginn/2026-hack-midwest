# Project Scope — USDA Weather-Driven Facility Decisions Challenge

Hack Midwest, Oct 10-11 2026. Solo build, ~16hr remaining at project start.

Status key per section: `DRAFT` → `REVIEWED` → `LOCKED` (locked = don't
revisit unless something downstream forces it)

Each section below follows this structure so we never lose the original
intent while iterating:
- **Original Definition** — what we scoped before touching real data/code.
  Not edited after the fact, even if later proven wrong.
- **Findings** — what we learned (API checks, test runs, constraints found).
- **Resolved Design** — current decision, informed by findings. This is the
  part that changes as we iterate.
- **Open Questions** — anything still unresolved.

## Credentials & Secrets (reference only — no actual secrets here)

Real values live in `/home/uamcginn/workspace/2026-hack-midwest/.env`
(gitignored, never committed). This section just tracks *which* services
have keys provisioned, so we don't lose track of what's available.

| Service | Env var | Status | Notes |
|---|---|---|---|
| AQICN (api.waqi.info) | `AQICN_API_TOKEN` | provisioned | free tier, user-registered 2026-10-10 |
| NWS (api.weather.gov) | n/a | no key needed | required `User-Agent` header only |
| USGS Water Services | n/a | no key needed | |
| NHC CurrentStorms.json | n/a | no key needed | |
| AirNow | n/a | **not provisioned** | confirmed requires key; not pursued, using AQICN instead |
| State DOT / 511 | n/a | **not provisioned** | registration-gated, not feasible in time remaining; production-roadmap item only |

If more keys get registered mid-build, add a row here (service + env var
name only, never the value) and the actual value goes in `.env`.

---

## 0. Challenge Recap

Build a system that ingests NWS weather data + other signals, evaluates threat
against a facility, recommends a closure posture to a human decision-maker,
and generates the notification reaching the right employees. Must include an
auditable decision record. No slide decks — live demo only, 3 min pitch.

Judging: value/impact/usefulness, innovation/uniqueness, realness/completeness.

---

## 1. Data Sources

**Status: REVIEWED**

### Original Definition

> Required — Live: NWS/NOAA Alerts API, free, no key.
> Required — Synthetic: Facility profile (location, hours, building type,
> accessibility notes), employee roster (role, essential-personnel flag,
> telework-eligible flag, assigned building, current status).
> Supplementary (pick one): Option A — derive synthetic road-impact signal
> from NWS event type. Option B — AirNow.gov air quality for wildfire smoke.

### Findings

**API field shape (confirmed live, 2026-10-10):**
Hit `api.weather.gov/alerts/active` directly — 515 active alerts nationally
at check time.
- Confirmed real fields: `severity` (Minor/Moderate/Severe/Extreme),
  `certainty` (Possible/Likely/Observed/**Unknown**), `urgency`
  (Future/Expected/Immediate/**Unknown**), plus `event`, `headline`,
  `description`, `instruction`, `response`, `effective`, `onset`, `expires`,
  `ends`, `areaDesc`, `senderName`.
- **Not all alert types populate severity/certainty/urgency.** Checked 9
  live "Air Quality Alert" records — all 9 returned `Unknown/Unknown/Unknown`.
  Unscorable against taxonomy thresholds.
- **Flood Warning** rich and live: Clinton/Scott County, IA (NWS Quad
  Cities), `Severe/Observed/Immediate` — corn-belt ag territory.
- **Winter Storm Warning** rich and live: 9 active, all Montana (NWS
  Billings/Missoula/Great Falls), all `Severe/Likely/Expected`.

**Query/location parameters (confirmed via `GET /openapi.json`):**
`alerts/active` supports these location params, **mutually exclusive** with
each other: `point={lat},{lon}`, `area={state code}`, `region`,
`region_type`, `zone={UGC code}`. Also supports non-location filters:
`event`, `code`, `status`, `message_type`, `urgency`, `severity`, `certainty`.

- `point` matches via geometry polygon containment. **Live test found a
  false negative**: `point=41.8847,-90.1943` (Clinton, IA downtown) against
  a real, active Clinton County flood warning returned **zero results**,
  because the warning's polygon covers the river corridor, not the whole
  county.
- `zone=IAC045` (Clinton County UGC) against the same live scenario
  **correctly returned the warning.**
- `area={state}` is broadest/coarsest — fine for exploration, too coarse
  for a specific facility.

**NWS has no city/state → coordinate geocoding endpoint.** Confirmed by
scanning the full path list in `/openapi.json` — no `geocode`/`search`/
`city` endpoints exist. NWS only resolves the other direction:
- `GET /points/{lat},{lon}` → returns `county` (UGC), `forecastZone` (UGC),
  and human-readable `relativeLocation.city`/`state` (free, no key)
- `GET /zones/county/{UGC}` → returns the zone's human-readable `name` and
  `state` (e.g. `IAC045` → name: "Clinton", state: "IA")

Not a blocker, since facility data is synthetic: we author lat/lon at
registration time (as if a geocoder ran once when the facility was created,
same as a real system would do), so both the address and the coordinates
are simply part of the authored record — no runtime translation layer
needed.

**Second data source found: NHC `CurrentStorms.json`** (confirmed live,
2026-10-10). `https://www.nhc.noaa.gov/CurrentStorms.json` — free, no key.
Distinct from NWS alerts: tracks active tropical cyclones directly, with
**continuous/numeric** fields (`intensity` in kt, `pressure` in mb,
`latitude`/`longitude` track position, `movementDir`/`movementSpeed`,
`classification` e.g. PTC/TS/HU) rather than NWS's categorical
severity/certainty/urgency. This satisfies the challenge's **"at least one
supplementary signal"** requirement with a real second API, not a derived
synthetic signal.
- Live right now: Post-Tropical Cyclone **Isaias**, at 33.5N/-86.9W
  (inland Alabama), moving NE at 15kt — real USDA ag/forestry territory.
- Also live: Tropical Storm **Rachel** (East Pacific).
- Also found via NWS alerts: an active **Tropical Storm Watch** / Tropical
  Cyclone Local Statement for San Diego County, CA —
  `Severe/Possible/Future`. Good example of the "upcoming but yet unknown"
  case your earlier note raised: a Watch (not Warning), low certainty,
  future urgency — a distinct, useful low rung on the posture ladder
  (early awareness, not action-triggering).

**Clarified test for "distinct data source"** (2026-10-10, after user
pushback on the tornado-vs-flood framing): the test is NOT "different
hazard/event name." A Tornado Warning and a Flood Warning are both the
same categorical severity/certainty/urgency taxonomy from the same
endpoint — same evaluator code path, not a second source. The real test is
whether the field **structure** differs (categorical labels vs. structured
numeric measurement) such that a genuinely different evaluator is needed.

**Found live, 2026-10-10 — USGS Water Services** (`waterservices.usgs.gov`,
free, no key): real-time river gauge height, numeric/continuous, in feet.
Confirmed a live gauge directly relevant to our existing Iowa demo
facility: **"Mississippi River at Clinton, IA" (site 05420500), reading
9.86 ft** at check time. This is one of the challenge's own named examples
("river gauge and flood-stage data") and is hyper-local — same river,
same county as our primary facility — rather than requiring a separate
facility in a different state.

**Found live, 2026-10-10 — AQICN** (`api.waqi.info`, requires free API
token, user has registered one — see `.env`, not committed to the scope
doc). Confirmed working: `geo:{lat};{lon}` lookup returns real-time AQI
plus structured sub-indices (pm25, o3, so2, dew point, humidity, pressure,
wind). Live result for Clinton, IA: **AQI 64** at "Rainbow Park, Clinton,
Iowa" station — same facility again. AQI itself maps to EPA's own
Good/Moderate/Unhealthy-for-Sensitive-Groups/etc. categorical scale, which
is a federally-defensible threshold citation (same spirit as using NWS's
own severity taxonomy). This **reverses the earlier "air quality: dropped"
decision** — that was based on NWS's Air Quality Alert event type (which
has `Unknown` severity fields) and on AirNow specifically requiring a key
we didn't have. AQICN is a different provider, confirmed working, with a
real key now available.

**Checked state DOT / 511 road condition feeds (round 1, 2026-10-10):**
generic `511ia.org` frontend only, no public JSON API found that way.

**Re-checked with user-supplied leads (round 2, 2026-10-10):**
- **Iowa DOT GIS** (`gis.iowadot.gov/agshost/rest/services`, ArcGIS
  REST, confirmed public/no-key): real endpoint, browsed the full folder
  tree. `Traffic_Operations/ATMS_Layers` exists but is infrastructure
  (ramp points, lanes, routes) not live condition/closure status. `RWIS`
  folder (Road Weather Information System — exactly the right concept)
  exists but returned empty. `Emergency` folder requires a token
  (`"Token Required"`, HTTP-equivalent 499). **No usable live road-
  condition signal found here**, though the catalog API at
  `data.iowadot.gov` (ArcGIS Hub, confirmed public) is real and could be
  explored further if time allows — not pursued further given time budget.
- **SC DOT GIS** (`gis.scdot.org`): generic ArcGIS portal/help page is
  public, but couldn't resolve the actual REST services root (tried a
  couple of common ArcGIS Online patterns, got `Invalid URL`/404). Would
  need the specific service item ID from the portal UI to use directly.
  **Not pursued further** given time budget — the portal itself confirms
  SC DOT has GIS data, just didn't find the specific live endpoint today.
- **GA 511** (`511ga.org/Alert/GetUpdatedAlerts?lang=en`): **confirmed
  live, no key, working.** Real road alerts with county FIPS region codes.
  Found a directly relevant live alert: **"SEVERE WEATHER ALERT: Hurricane
  Isaias Impacts (10/9-10/11)"** and a companion "Beware of Trees/Powerlines
  Down" alert — ties our SC/GA tornado lead-demo region and the Isaias/NHC
  thread together into one coherent regional story.
  - **Important limitation**: this feed is **unstructured free text only**
    (`message`/`additionalText` strings + county FIPS list) — no severity,
    no numeric field, nothing to threshold against. Structurally similar
    to the earlier `Unknown`-severity problem, but worse: there's no field
    at all to check, not even a placeholder. **Can't feed the scoring
    evaluator**, but **can feed the notification/rationale text** — e.g.
    surfacing "DOT also reports trees/powerlines down in the area" as
    supporting context in the plain-language rationale, without it
    affecting the posture score.

**Correction (round 3, 2026-10-10)** — user clarified the SC endpoint
found earlier was for public comments, not road conditions (not pertinent,
dropped). User then supplied two more specific leads, both ArcGIS
FeatureServer `query` endpoints (same API family as everything else
checked today, just a different hosted service):

- **`511_IA_Road_Conditions_View`** (confirmed live, no key, POST query):
  **genuinely scorable** — `ROAD_CONDITION_CODE` is a real numeric field
  (confirmed value `10` = "Seasonal", i.e. normal baseline, across all
  1014 current Iowa road segments checked). Also carries
  `PREVIOUS_ROAD_CONDITION_CODE`, `CONDITION_CHANGE_START/END`, and
  elapsed-time-in-current-condition fields — richer than anything else
  found today, including built-in "how long has this been abnormal" data
  that maps directly to our "what would change this" output field (section
  5). **This corrects my earlier round-2 conclusion** that Iowa DOT had no
  usable scorable live condition data — that search just didn't find the
  right hosted service; it exists, confirmed now.
  - Caveat: no domain/legend metadata exposed via the API for what codes
    besides `10` mean (e.g. what code represents ice/snow/flooding). Can't
    responsibly guess the full scale without documentation — flagged as
    an open question, not fabricated.
- **`CARS511_MN_Events_View`** (confirmed live, no key, POST query):
  structurally different again — `Priority` (numeric), `STYLE` (e.g.
  `roadwork`, `future_event`), `headline`/`phrase`/`cause` (free text).
  Live sample data today is all **construction/maintenance events**, not
  weather-driven — not useful for our current demo facilities (Iowa,
  Montana, SC/GA), but confirms the same CARS511 platform exists for
  Minnesota and the `Priority` field is in principle scorable if a
  weather-driven event ever populates it.

**Net result (revised)**: Iowa DOT's CARS511 road-conditions feed is a
**real, scorable, hyper-local fourth-ish candidate signal** for the Iowa
facility (same state as our primary demo), alongside USGS gauge height and
AQICN. GA 511 remains narrative-only (no scorable field). MN CARS511
events exist but aren't presently relevant to our chosen facilities.

**Found via user — KDKD (Clinton, IA area) school/business closings**
(2026-10-11): `mykdkd.com` runs a WordPress "Entity Closing Lite" plugin;
closings are fetched via `POST .../entity-closing-lite/post/
list-front.php` with a `chkClo` validation token. Confirmed the token is
**embedded in the public closings page HTML** (`cl_wpb_key`), not
session-bound — a bogus token returns `"error"`, the real one (scraped
fresh from the page) works with no cookie required, confirmed across
multiple test runs (one transient `error` on an identical request,
likely a momentary blip, not reproduced on retry). Live result today:
`{"count":"0","list":[]}` — no active closings, consistent with no severe
weather affecting Clinton, IA schools right now. This is **exactly the
kind of hyper-local, informal source a real facility manager would check**
per the challenge text ("maybe a local school district's announcement") —
and it's structurally unlike anything else found (static scraped token +
POST form, not a REST GET), making it a strong worked example for the
"extendable to custom per-facility sources" idea (see section 4).
Narrative-only, same tier as GA 511.

### Resolved Design

**Data sources in scope:**
- **NWS Alerts API** (`api.weather.gov/alerts/active`) — primary source,
  categorical severity/certainty/urgency taxonomy. Used for all hazard
  event types (tornado, flood, winter storm, etc.) — one evaluator, many
  event names, not separately counted sources.
- **USGS Water Services** (`waterservices.usgs.gov`) — supplementary
  source, numeric/continuous gauge height. **Primary pick for satisfying
  "at least one supplementary signal"** — hyper-local to the Iowa demo
  facility (same river/county), free, no key, confirmed live.
- **AQICN** (`api.waqi.info`) — second supplementary source candidate, now
  back in scope with a working token. Numeric AQI + sub-indices, EPA-scale
  categorical mapping for defensibility. Also hyper-local to Iowa facility.
  Credentials in `.env` (gitignored) — see Decision Log / secrets note.
- **NHC `CurrentStorms.json`** — kept as a third candidate/stretch, only
  relevant if we build the Alabama/Isaias scenario. Demoted below USGS/
  AQICN in priority since those two are both hyper-local to the facility
  we're already building, while NHC requires an entirely separate facility
  located near an active storm track.
- **Iowa DOT `511_IA_Road_Conditions_View`** (ArcGIS FeatureServer, no
  key) — confirmed scorable (`ROAD_CONDITION_CODE` numeric field). Promoted
  to a real supplementary signal for the Iowa facility, alongside USGS
  gauge height and AQICN. Build this one if time allows; the exact
  code-to-severity scale needs to be inferred/documented since no domain
  metadata is exposed (see Open Questions).
- **GA 511 Alerts** (`511ga.org/Alert/GetUpdatedAlerts`) — confirmed live,
  no key, directly relevant (live Hurricane Isaias road-impact alerts for
  our SC/GA region). **Narrative/notification-enrichment input only** —
  unstructured text, no scorable field, does not feed the posture score.
  Surfaced in rationale text as supporting context when present ("DOT also
  reports X in the area"), with status equivalent to `insufficient_data`
  framing from section 2/3 (shown, not scored).
- **MN CARS511 Events** (`CARS511_MN_Events_View`) — same platform family
  as Iowa's feed, confirmed live/no-key, has a scorable `Priority` field
  in principle, but current live data is construction/maintenance only,
  not weather-driven, and MN isn't one of our chosen facility states.
  **Documented as a future input, not built** — same CARS511 pattern could
  extend to any state on this platform.
- SC DOT: the earlier "portal" lead was for public comments, not road
  conditions — dropped as not pertinent (not a data source at all).

### Other Potential Future Inputs (documented, not built this hackathon)

Captured here so good ideas aren't lost even though we won't build all of
them in 16 hours. Not evaluated/tested live — listed because they're
plausible given today's findings (same style of free public data, or
named in the challenge text) and worth a line of documentation for "if
this were a real production system."

- **Other states' CARS511 feeds** — same ArcGIS FeatureServer pattern
  found for Iowa/Minnesota likely exists for many states (CARS511 is a
  common state DOT platform vendor). Worth a quick survey in a future pass.
- **Power outage reporting** (named in challenge text) — utilities
  increasingly publish public outage-map data feeds (e.g. some states'
  PUC-mandated outage dashboards); not checked today, candidate for a
  future pass.
- **School district / local government closure announcements** (named in
  challenge text) — generally no standardized public API; would likely
  require per-district scraping or a news/announcement aggregator. Lower
  priority given the effort-to-signal ratio.
- **NWS Gridpoints Forecast** (`/gridpoints/{office}/{x,y}/forecast`) —
  found during this session's investigation (section 1 findings above),
  structured numeric forecast data (temp, wind speed, precip %). Not a
  warning/alert signal, so weaker fit for "why does this drive a closure
  today," but could support a forward-looking "conditions expected to
  worsen" dimension.
- **NWS Observations** (`/stations/{id}/observations/latest`) — actual
  current ground-truth readings (not forecast), could corroborate alerts
  with real-time measured conditions at a station near the facility.
  Not checked live this session.
- AirNow specifically (vs. AQICN): still ruled out — confirmed
  `"Request not authenticated"` without a key, and we don't have an
  AirNow key (we have an AQICN key, a different provider).

**Hazard/facility scenarios in scope (finalized 2026-10-11):**
- **Primary/lead demo**: **Flood Warning, Iowa facility** (Clinton/Scott
  Co.) — most thoroughly verified scenario, confirmed live and unchanged
  across multiple re-checks. All four Iowa-area sources (NWS, USGS gauge,
  AQICN, Iowa DOT road conditions) already captured as fixtures. Chosen
  over the earlier SC-tornado lead-demo plan after that alert cleared —
  prioritizing demo stability over chasing whichever hazard is most
  dramatic at any given moment.
- **Secondary demo**: **Winter Storm Warning, Montana facility** — proves
  the evaluator generalizes across event types/regions, not hardcoded to
  flood. Re-verify live closer to actual demo time (conditions shift
  hour-to-hour, confirmed firsthand with the SC tornado -> cleared, and
  GA/NC tornado -> flood shifts observed during scoping).
- **Supplementary-signal demo**: **USGS gauge height + AQICN AQI + Iowa
  DOT road conditions**, all against the **same Iowa facility** as the
  primary demo. Simpler than standing up a separate facility, and
  genuinely satisfies the deliverable with real distinct sources.
  NHC/Alabama remains available as a stretch add only.
- **GA/regional mention (narrative-only, not a built facility/scenario)**:
  GA 511 showed live statewide flood-related road alerts during scoping
  (plus NC/GA flood warnings via NWS). Worth a single mention in the pitch
  as "the system can also surface state-level road-condition awareness
  even without a specific facility pinned there" — but not worth building
  out a fourth facility + evaluator pairing for, given time remaining.
  Demonstrates breadth of the data-source approach without overcommitting
  build time.

**Current facility count (updated 2026-10-11, later session)**: 7
facilities across 5 states, seeded with employees — Iowa Clinton (5
employees, lead demo), Iowa Des Moines (2 employees, added for picker
variety), Montana Billings (1 employee), Montana Great Falls (2
employees, added for picker variety and because it was one of the
offices actively issuing Winter Storm Warnings during original
scoping), Alabama Montgomery (0 employees, intentionally -- demonstrates
the stretch-only NHC scenario slot and confirms the UI handles an empty
roster correctly, not as a bug), **San Diego CA (2 employees, added to
verify zero-code-change generalization), Pendleton OR (2 employees,
same purpose)**. See `data/synthetic/facilities.yaml` and
`employees.yaml` for current authoritative state.

**Verification: new locations/hazard types require zero code changes
(2026-10-11, later session).** Checked nationwide active NWS alerts
(506 active at check time) specifically for hazard types NOT already
exercised by the existing Clinton (Flood Warning) and Great Falls
(Winter Storm Warning) facilities. Added two brand-new facilities --
San Diego, CA (live Flash Flood Warning, Severe/Likely/**Immediate** --
the highest-urgency case not yet tested) and Pendleton, OR (live Freeze
Warning, a third distinct hazard family) -- using only data edits
(`facilities.yaml`/`employees.yaml`), no source code touched. Both
evaluated correctly on the first request: zone resolution, CAP scoring,
posture mapping, rationale generation, notification recipients, and
the full UI all worked immediately. San Diego's zone turned up 9
simultaneous distinct active alerts at check time (a real multi-hazard
day -- Flash Flood Warning, Coastal Flood Warning, Tropical Storm
Watch, etc.); the max-of-government-tier logic correctly picked the
single highest-scoring one (Flash Flood Warning) as the driving source
without being confused by the other 8. This is good evidence the
system generalizes as designed, not hardcoded to the two originally-
demoed hazard types -- and a natural real-world example of the
multiple-concurrent-severe-alerts case flagged earlier as a possible
future escalation-logic enhancement (not fixed here, still correct
without it, just not escalated further).

**Facility → alert lookup pipeline:**
1. Facility record stores a precise **lat/lon** (authoritative for the API)
   plus **human-readable identity fields** (authoritative for the manager
   finding their own facility — see data model below).
2. At evaluation time: `GET /points/{lat},{lon}` → resolve `county` UGC and
   `forecastZone` UGC. Derived at runtime, not stored, so it can't go stale.
3. `GET /alerts/active?zone={county UGC}` → all active alerts for that
   facility's county.
4. Each returned alert feeds the evaluator (section 2/3).

**Facility data model** (answers: "as a facility manager, how do I find
information for my specific facility"):

```json
{
  "facilityId": "USDA-FSA-IA-CLINTON",
  "name": "USDA FSA Clinton County Office",
  "address": {
    "line1": "123 Example St",
    "city": "Clinton",
    "state": "IA",
    "zip": "52732"
  },
  "coordinates": { "lat": 41.8847, "lon": -90.1943 },
  "resolvedZone": {
    "countyUGC": "IAC045",
    "forecastZoneUGC": "IAZ066",
    "note": "resolved at runtime via /points, not hand-maintained"
  },
  "hours": "08:00-16:30",
  "buildingType": "office",
  "accessibilityNotes": "ground-floor ADA accessible"
}
```

Why both address AND coordinates: a facility manager searches/recognizes
their facility by **name, city, state, address**; the system needs
**lat/lon** to call NWS/NHC. Since the data is synthetic, both are simply
authored together at creation (as if a geocoder ran once at registration) —
no runtime translation needed. `resolvedZone` is still always re-resolved
live via `/points` rather than trusted as stored truth, since it's cheap
and avoids drift if coordinates are ever edited.

**Delighter, not core scope (confirmed 2026-10-11)**: section 4 describes
a "custom per-facility narrative source" extensibility pattern (KDKD
being the worked example), but this facility schema does not yet have a
field for it (e.g. `customSources: []`), and that's intentional. KDKD/
custom-source wiring is explicitly a **stretch delighter to add only
after the core pipeline (NWS + USGS/AQICN/Iowa-DOT scoring, tiered
output, templated rationale) is working end-to-end** — not something to
build in parallel with the core path. If time allows: simplest honest
version is a hardcoded association (Iowa facility -> KDKD fetch
function) rather than a configurable field; the generic `customSources`
field itself stays a documented future-roadmap item, not something to
half-build under time pressure.

**Employee + daily schedule data model — redesigned (2026-10-11, see
Decision Log)**. The original `assignedFacilityId`/`currentFacilityId`/
`currentStatus` fields-on-employee design was wrong in a specific way: it
conflated "who someone generally is" with "where they are today," which
is inherently a per-day fact, not a slowly-changing attribute. It also
couldn't cleanly express "normally full-remote, but in-office today for a
specific reason" — only one direction of exception.

Corrected model, split into three pieces:

**1. Employee** — stable identity/role facts, not day-specific:

```json
{
  "employeeId": "E1001",
  "name": "Jordan Rivera",
  "phone": "555-0100",
  "email": "jordan.rivera@example.gov",
  "role": "Soil Conservationist",
  "homeFacilityId": "USDA-FSA-IA-CLINTON",
  "remoteStatus": "in_office",
  "essentialPersonnel": false,
  "teleworkEligible": true
}
```

- `homeFacilityId` — where they're normally based (replaces
  `assignedFacilityId`)
- `remoteStatus` enum: `in_office` | `full_remote` | `hybrid` — their
  normal working pattern, not today's specific status
- `essentialPersonnel` / `teleworkEligible` — unchanged in meaning from
  the original design

**2. Facility roster** — not a stored structure, a derived query: everyone
whose `homeFacilityId` matches the facility. No separate join table needed.

**3. Daily schedule entries** — exceptions to the norm, for a specific
facility and date, replacing the old always-current `currentFacilityId`/
`currentStatus` fields:

```json
{
  "date": "2026-10-11",
  "facilityId": "USDA-FSA-IA-CLINTON",
  "entries": [
    { "employeeId": "E1003", "status": "on_detail", "locationNote": "Billings, MT field office this week" },
    { "employeeId": "E1004", "status": "telework" },
    { "employeeId": "E1006", "status": "in_office_today", "locationNote": "normally full_remote, in-office for quarterly review" }
  ]
}
```

- `status` enum: `on_detail` | `telework` | `leave` | `in_office_today` —
  the last one is the direction the old model couldn't express (a
  normally-remote person who happens to be on-site that day, and would
  therefore be affected by a facility closure despite being "full_remote"
  on their employee record)
- Only exceptions are listed — someone with no entry for the day is
  assumed to be following their normal `remoteStatus`/`homeFacilityId`

**Who's applicable at a facility, for a given day** (the actual query the
notification/decision logic needs — replaces the old
"`currentFacilityId` crossed with `currentStatus`" framing):

```
applicable = (
    employees WHERE homeFacilityId = X AND remoteStatus != full_remote
    AND no schedule entry for today with status in {on_detail, telework, leave}
  )
  UNION (
    employees WITH a schedule entry for today, status = in_office_today
  )
```

This directly supports section 5's notification logic: it's an
explainable, auditable rule ("here's who we counted as physically
affected today, and why") rather than a snapshot field that could go
stale. Essential personnel are still always notified regardless of
whether they're "applicable" by this rule — reporting requirements don't
change with posture.

**Explicit scope boundary (2026-10-11, user correction):** this system
evaluates facility/location conditions, not individual employee commute
routes. A snowstorm closing a mountain pass is relevant because it affects
the *facility's* operating posture (can people safely get there at all,
should the facility be open) — modeling which specific routes individual
employees take to get there is out of scope. The human decision-maker is
responsible for any employee-specific judgment calls; the system's job is
to correctly identify *who is in the "would be affected if the facility
posture changes" set* (via the applicability rule above), not to model
each person's individual travel risk.

### Open Questions
- [ ] None blocking — section locked pending section 2/3 scoring table,
      which may reveal we want additional facility fields (e.g. flood-plain
      proximity) as a modifier input later.
- [x] **Resolved 2026-10-11**: Iowa DOT `ROAD_CONDITION` legend found via
      the MapServer layer's `drawingInfo.renderer.uniqueValueInfos` — the
      same symbology ArcGIS uses to color the map is a complete,
      authoritative 5-state legend: Impassable, Travel Not Advised,
      Completely Covered, Partially Covered, Seasonal (normal baseline).
      Ordered worst-to-normal by the map's own red->green convention.
      Captured in `data/fixtures/ia-dot-road-condition-legend.yaml`. Used
      the **string** `ROAD_CONDITION` field for this mapping rather than
      the numeric `ROAD_CONDITION_CODE`, since the code-to-string pairing
      beyond `Seasonal=10` was never independently confirmed — scoring
      off the string value sidesteps that gap entirely.

---

## 2. Evaluation Methods

**Status: REVIEWED**

### Original Definition

> Each input source is evaluated independently. NWS Alert Evaluator maps
> severity/certainty/urgency → posture-pressure score (0–4). Secondary
> Hazard Evaluator maps a derived/real secondary signal → its own score.
> Optional Facility Modifier for accessibility/building-age, time allowing.

### Findings

Confirmed live that some NWS alert types (Air Quality Alert) return
`Unknown` for severity/certainty/urgency (see section 1). The evaluator
needs a defined behavior for this case, not just a scoring table for the
"normal" case.

### Resolved Design

- **NWS Alert Evaluator**: maps `severity`/`certainty`/`urgency` triple →
  posture-pressure score (0–4 scale). Same evaluator logic runs against
  both the Iowa (flood) and Montana (winter storm) facilities — proves it's
  general-purpose, not hardcoded to one hazard type. This replaces the
  original "Secondary Hazard Evaluator" concept (no longer a different kind
  of signal, just the same evaluator against a second real facility).
- **Facility Modifier**: still optional/stretch, only if time allows.
- **Insufficient-Data Handling** (new, not in original definition): each
  evaluation outcome carries a `status` field, `"scored"` or
  `"insufficient_data"`. When `insufficient_data`, the alert is still
  surfaced (headline, event type, timestamps) for human awareness, but
  contributes zero/minimal weight to the final score, and the rationale
  text says so explicitly (e.g. "An Air Quality Alert is active but does
  not carry standard severity data; shown for awareness, did not factor
  into this recommendation."). This is a deliberate defensibility feature,
  not a gap — call it out in the pitch.
- **Absence-of-signal is not evidence of normalcy** (new, from user
  insight 2026-10-10): if a source has *no active alert/event at all*
  (e.g. no NWS alert for a facility, or Iowa DOT showing baseline
  `10`/Seasonal), that is a **neutral, zero-weight input** — it should
  never be treated as a positive signal that pulls the aggregate score
  *toward* "normal." The system is not meant to make the final call, only
  to surface and prioritize what's known; absence of one signal must not
  be allowed to dilute or outvote a present signal from another source.
  Concretely: the weighted-average approach in section 4 needs to
  **average only over present/scored signals**, not over "all possible
  signal slots" with absent ones defaulting to 0 (a true 0 would
  incorrectly count as "confirmed normal," rather than "nothing to
  report"). An absent signal is simply omitted from the input list, not
  included at value 0.

### Open Questions
- [x] **Resolved in section 3 (2026-10-11)**: severity/certainty/urgency →
      score mapping is now a formula (severityBase × certaintyModifier)
      built from official CAP definitions, not a hand-authored table.
- [x] **Resolved in section 3 (2026-10-11)**: threshold defensibility
      citation is the official CAP v1.2 enumeration definitions
      themselves (certainty's probability bands in particular), rather
      than OPM operating-status categories — CAP gave more directly
      citable numeric grounding than OPM's categories would have. OPM
      categories remain a secondary citation option if needed for the
      pitch narrative (closure posture names loosely echo OPM's own
      operating-status vocabulary).

---

## 3. Individual Evaluation Outcomes

**Status: REVIEWED**

### Original Definition

> Each evaluator returns a structured result: source, signal, severity,
> certainty, urgency, postureScore, threshold, timestamp, rawRef.

### Findings (2026-10-11)

Pulled the **official CAP (Common Alerting Protocol) enumeration
definitions** for severity/certainty/urgency (via Google's public CAP
requirements docs, which mirror the OASIS CAP v1.2 spec NWS implements):

- **Severity**: Extreme = "extraordinary threat to life or property",
  Severe = "significant threat", Moderate = "possible threat", Minor =
  "minimal threat". This is a direct graded threat scale — maps cleanly
  to a 1-4 base score.
- **Certainty**: Observed = "event either occurred or is ongoing", Likely
  = "likely to occur, approximate probability >50%", Possible =
  "possible but not likely, probability <=50%", Unlikely = "not expected
  to occur, probability ~0%". **This is the key defensibility find**:
  certainty isn't just a vague confidence label, it has defined
  probability bands we can cite directly.
- **Urgency**: Immediate = "take responsive action immediately", Expected
  = "take action soon (within the next hour)", Future = "take action in
  the near future", Past = "no longer required". Urgency is about
  *timing* of required action, not threat magnitude — using it to
  directly rescale the severity score would double-count timing that's
  often already implicit in how severe/certain an alert is. Decision:
  urgency does not rescale the posture score; it informs the
  `whatWouldChange`/timing framing in the rationale text instead (e.g.
  distinguishing "act now" from "on the radar, not yet actionable").

### Resolved Design — NWS scoring formula

Rather than a hand-authored 4x4x4 lookup table (64 cells, hard to
individually defend), the score is a **formula built directly from the
official CAP definitions**:

```
severityBase =  Extreme: 4 | Severe: 3 | Moderate: 2 | Minor: 1 | Unknown: insufficient_data

certaintyModifier =
  Observed: 1.0   (CAP: "occurred or is ongoing" - full weight)
  Likely:   0.85  (CAP: >50% probability - high confidence)
  Possible: 0.5   (CAP: <=50% probability - meaningful but hedged)
  Unlikely: 0.1   (CAP: ~0% probability - near-zeroed, alert still surfaced)
  Unknown:  insufficient_data

postureScore = clamp(severityBase * certaintyModifier, 0, 4)
```

If either `severity` or `certainty` is `Unknown`, the outcome's `status`
is `insufficient_data` (section 2), not a computed score — this is also
exactly the Air Quality Alert case found during data-source
investigation (`Unknown/Unknown/Unknown`).

**Validated against real captured fixtures** (`data/fixtures/`), not
hypothetical cases:

| Scenario | Severity | Certainty | Score | Posture band |
|---|---|---|---|---|
| Flood Warning, Clinton IA (live, current) | Severe | Observed | **3.0** | Telework/Unscheduled Leave |
| Winter Storm Warning, Montana (live, earlier) | Severe | Likely | **2.55** | Early Dismissal/Telework boundary |
| Tornado Warning, SC (observed live, since cleared) | Extreme | Observed | **4.0** | Closure |
| Tropical Storm Watch, San Diego (live, via NWS alerts) | Severe | Possible | **1.5** | Delay |

This gives a correctly graded result: the "Watch" (lower certainty, not
yet happening) lands at Delay, not Closure, even though its *severity*
label is the same "Severe" as our Flood Warning — this is precisely the
"upcoming but yet unknown" distinction raised earlier in scoping, now
backed by real numbers instead of a qualitative description.

```json
{
  "source": "NWS",
  "signal": "Flood Warning",
  "severity": "Severe",
  "certainty": "Observed",
  "urgency": "Immediate",
  "status": "scored",
  "postureScore": 3.0,
  "threshold": "severityBase(Severe=3) x certaintyModifier(Observed=1.0) = 3.0",
  "timestamp": "2026-10-10T09:00:00Z",
  "rawRef": "<alert id/url>"
}
```

Insufficient-data variant (e.g. Air Quality Alert with Unknown fields):

```json
{
  "source": "NWS",
  "signal": "Air Quality Alert",
  "severity": "Unknown",
  "certainty": "Unknown",
  "urgency": "Unknown",
  "status": "insufficient_data",
  "postureScore": 0,
  "note": "Alert active but lacks standard severity/certainty/urgency data; shown for awareness, not scored.",
  "timestamp": "2026-10-10T09:00:00Z",
  "rawRef": "<alert id/url>"
}
```

### Open Questions
- [x] **Resolved 2026-10-11**: scoring formula built from official CAP
      definitions (severityBase x certaintyModifier), validated against
      real fixtures, see Resolved Design above.
- [x] **Resolved 2026-10-11**: urgency informs timing/rationale text, not
      the numeric score directly (avoids double-counting timing that's
      often already implicit in severity/certainty).
- [ ] NHC intensity (kt) -> 0-4 conversion still not finalized (stretch
      scenario only, lower priority given time remaining)
- [x] **Resolved 2026-10-11 (implementation)**: USGS gauge height
      ratio-to-flood-stage conversion implemented in
      `server/src/evaluator/usgsScoring.ts` (ratio buckets: <60% normal,
      60-90% delay, 90-100% early dismissal, 100-110% telework, 110%+
      closure). Validated against real Clinton, IA data (9.86 ft / 11.0
      ft reference -> 90% -> delay/early-dismissal boundary) and the
      flood warning's own cited crest value (12.5 ft -> 114% -> closure).
- [ ] **FLAGGED TO REVISIT**: USGS has no native flood-stage field of its
      own (confirmed via live API response -- no threshold in the
      `/nwis/iv` response). The adapter currently requires the caller to
      pass `floodStageFt` explicitly (verified: returns
      `insufficient_data` honestly if omitted, rather than guessing). The
      11.0 ft value used in testing was pulled from the *NWS Flood
      Warning's own free-text description*, not from USGS. This is NOT
      YET WIRED into the facility repository/evaluation flow -- when we
      build that (facility -> which gauge -> what flood stage), we need
      to decide: (a) hardcode a per-facility flood-stage reference in the
      synthetic facility data, (b) look it up from a public NWS flood-
      stage reference endpoint if one exists (not yet checked), or (c)
      parse it out of the related Flood Warning's free text (fragile).
      Revisit before wiring the Iowa facility's full evaluation.
      **Partial check done (2026-10-11)**: NWS/NOAA does appear to have
      a river-forecast API at `api.water.noaa.gov/nwps/v1/gauges/{id}`
      (NWPS -- National Water Prediction Service) that returns a
      structured "could not find gauge ID" error for a wrong ID, strongly
      suggesting it's real and would include flood-stage data for a
      correct NWS gauge ID (different ID scheme than USGS's numeric site
      IDs, not yet mapped). Attempting to list/search gauges by name
      timed out (504) with no obvious filter param -- did not pursue
      further to avoid burning build time on an unconfirmed path. Likely
      the right answer for option (b) above if time allows revisiting;
      otherwise default to option (a), hardcoding a reference value in
      the synthetic facility data (least effort, still honest since the
      data is synthetic anyway).

---

## 4. Final Output Parameters & Weighted Sources

**Status: REVIEWED**

### Original Definition

> Primary signal (NWS) weighted highest (0.7), secondary weighted lower
> (0.3). Weighted score mapped onto posture ladder buckets. Confidence
> derived from certainty directly.

### Findings

Revisited after section 1 added NHC `CurrentStorms.json` as a real second
data source. The primary/secondary weighting framing is back and now
correctly grounded: **NWS alerts = primary signal** (categorical,
authoritative, direct basis for most USDA facility decisions), **NHC storm
track/intensity = secondary signal** (numeric, relevant mainly for coastal/
inland-storm-path facilities, not every facility will have an active NHC
track to evaluate). The two Iowa/Montana demo facilities only ever have an
NWS signal (no NHC storm applies there) — NHC weighting only engages for
the stretch Alabama/Isaias scenario.

### Resolved Design (standardization model, finalized 2026-10-11)

**Common scale**: every scored source converts its native unit into a
0–4 "posture pressure" score, matching the posture ladder directly:

```
0 = Normal | 1 = Delay | 2 = Early Dismissal | 3 = Telework/Unscheduled Leave | 4 = Closure
```

Sources do NOT get rescaled relative to each other — each has its own
documented native-unit-to-0-4 conversion (NWS via the categorical lookup
table in section 3; others below). **Weighting**, not scale distortion,
is how "NWS matters more" gets expressed — per user: official government
sources (NWS) should scale highest, supplemental resources (USGS, AQICN,
state DOT) matter but less, and purely narrative sources (GA 511, KDKD
school closings) don't get a numeric weight at all.

| Source | Native unit | Conversion into 0-4 | Weight | Tier |
|---|---|---|---|---|
| NWS Alerts | severity × certainty × urgency | categorical lookup table (section 3) | 1.0 | Primary (explicitly named in challenge text) |
| USGS gauge height | feet | ratio to published flood stage (e.g. 11.0 ft at the Clinton gauge, taken directly from the live flood warning's own text) | 0.5 | Supplemental |
| AQICN | AQI index (0-500) | EPA's own published AQI category breakpoints (Good/Moderate/USG/Unhealthy/Very Unhealthy/Hazardous) mapped onto 0-4 | 0.4 | Supplemental |
| Iowa DOT road conditions | `ROAD_CONDITION` (string, legend resolved 2026-10-11) | ordered 5-state legend from map renderer: Seasonal(normal)=0, Partially Covered=1, Completely Covered=2, Travel Not Advised=3, Impassable=4 | 0.4 | Supplemental |
| NHC storm track | intensity (kt) | Saffir-Simpson-adjacent bucketing | 0.3 | Supplemental (stretch-only facility) |
| GA 511 alerts | free text | **not scored** | 0 | Narrative-only |
| KDKD school closings (Clinton, IA) | free text / closing-type list | **not scored** | 0 | Narrative-only, custom per-facility source (see below) |

**Aggregation formula** — weighted average over only the sources that are
actually present and scored for a given facility/evaluation run (per
section 2's "absence is not evidence of normalcy" principle — missing or
narrative-only sources are *omitted* from the formula entirely, never
included as a 0):

```
finalScore = sum(sourceScore * sourceWeight for each PRESENT scored source)
             / sum(sourceWeight for each PRESENT scored source)
```

Concretely: for Iowa/Montana (NWS-only, the common case), `finalScore`
reduces to the NWS score directly — weight ratio is 1.0/1.0. When USGS/
AQICN/Iowa-DOT also have live scored data for a facility, they nudge the
aggregate up or down proportional to their lower weights, but can't
override a strong NWS signal unless several supplemental sources agree
strongly in the same direction. This directly implements "the official
government source scales highest, then supplemental resources matter but
less."

- Posture ladder bucket boundaries (tentative, unchanged from original):
  - 0.0–0.5 normal
  - 0.5–1.5 delay
  - 1.5–2.5 early dismissal
  - 2.5–3.5 telework / unscheduled leave
  - 3.5+ closure

**CORRECTION (2026-10-11, found during implementation)**: the weighted-
average formula above was implemented and tested against real live
data, and a real flaw surfaced immediately. Walked through three
concrete scenarios with the user:
- Active tornado warning, no flood/AQI issue -> NWS=4.0 diluted by two
  unrelated "normal" supplemental readings down to ~2.1 (Early
  Dismissal), two full bands below where a tornado warning should land.
- Upstream storm causing days of downstream flooding, no active NWS
  alert for this specific facility -> works correctly today, since USGS
  alone (absent NWS) isn't diluted by anything.
- Wildfire smoke spiking AQI, unrelated to flood/wind -> also works
  correctly today for the same reason (AQI alone, nothing to dilute it).

**The actual problem**: averaging only breaks when a strong government
signal is present ALONGSIDE scored (not absent) supplemental readings
that are reporting "normal" for an unrelated hazard dimension. A tornado
risk of 4 and a flood risk of 0 should NOT average to 2 -- these sources
mostly answer DIFFERENT questions (wind/storm vs. flood vs. air
quality), and we do not currently have per-source hazard-dimension
tagging that would let us correctly decide when to blend (same
dimension, corroborating) vs. when to take a max (different dimensions,
independent risks). Building that tagging correctly is real design work,
not a quick fix.

**Decision (per user)**: don't force a blended single number to drive
the recommendation yet. Simplify:
- `recommendedScore`/posture is now driven by the single
  highest-scoring **government-tier source only** (NWS). This matches
  both the challenge's framing ("the goal is not to automate the
  decision... make sure the person has everything they need") and
  avoids a confidently-wrong blended number.
- Supplemental sources are still fetched, scored, and shown in full
  (unchanged) -- just not blended into the posture number. The facility
  manager sees all of it, un-diluted.
- The old weighted-average is still computed and returned as
  `experimentalBlendedScore`, explicitly labeled as reference-only / not
  authoritative, since it's known to be wrong across unrelated hazard
  dimensions.
- **TODO, come back to this**: tag each source with a hazard dimension
  and only blend within a dimension (e.g. NWS Flood Warning + USGS gauge
  both speaking to flood risk specifically should corroborate/average;
  NWS Tornado Warning + USGS gauge should not). Take the max across
  dimensions. Not attempted this round -- needs real design time.
- Weights in the table above are no longer load-bearing for the
  recommendation (only used in the reference-only blended score) --
  kept in the table for whenever the hazard-dimension work happens.

**Custom per-facility sources (extensibility pattern, 2026-10-11)**: the
KDKD (Clinton, IA school closings) finding is a worked example of a
source that's facility/locality-specific rather than a general nationwide
API. Documented pattern (not a generic plugin system — too much to build
in the time remaining, but the shape is worth capturing): a facility
record could optionally carry a list of extra source configs, each
tagged `scored` or `narrative`, with its own fetch strategy. KDKD slots in
as `narrative`, same tier as GA 511. This demonstrates the architecture
*could* extend to arbitrary per-facility sources (a real deployment would
let a facility manager register "my district uses this closings site")
without us needing to build that generality for the hackathon.

### Open Questions
- [x] **Resolved 2026-10-11**: bucket boundaries checked against section
      3's real scored fixtures. Flood Warning (3.0) and SC tornado (4.0)
      land cleanly in Telework and Closure respectively. Winter Storm
      Warning (2.55) sits just inside Early Dismissal/Telework boundary —
      close to the 2.5 line but not ambiguous (2.55 > 2.5, lands in
      Telework). Tropical Storm Watch (1.5) sits exactly on the Delay/
      Early-Dismissal boundary — this is a genuine edge case worth noting
      for the demo narrative ("a borderline case, correctly shown as
      borderline") rather than a bug to fix. Boundaries kept as-is; no
      evidence from real data that they need adjusting.
- [ ] Define NHC → posture-pressure score mapping (intensity in kt →
      score, since NHC has no severity/certainty/urgency taxonomy to
      reuse) — still open, stretch-scenario only, lower priority

---

## 5. Outcome / Recommendation Pattern

**Status: REVIEWED** (notification recipients/message/channels wiring
still open — see Open Questions — but the core output structure and
rationale-generation approach are settled)

### Original Definition

> Final output object: posture, inputs, thresholdCrossed, confidence,
> whatWouldChange, rationale, notification (recipients/message/channels),
> decisionRecordId, recordedAt.

### Findings (2026-10-11)

Resolved the open "does urgency rescale the score" question from section
3 by reframing it as a **presentation** question rather than a pure math
question. Urgency does not need to be a hidden numeric multiplier — it
can be a **visible qualifier displayed next to each source's score**, in
plain language the facility manager would use directly. This also
answers the earlier-deferred "how do we prioritize findings for a
facility manager" question: group by source tier first, score within
tier second, with urgency as a human-readable annotation rather than a
sort key.

### Resolved Design

**Output is organized by source tier, matching section 4's weighting
model** (government/primary first, supplemental next, narrative-only
last), not as a flat list of inputs:

```
NWS (official / primary, weight 1.0):
  Flood Warning - Clinton County, IA
    Severity: Severe | Certainty: Observed | Urgency: Immediate
    Score: 3.0 (Telework / Unscheduled Leave band)
    "Observed and ongoing - act now."

  [if present] Flood Watch - adjacent county
    Severity: Severe | Certainty: Possible | Urgency: Future
    Score: 1.5 (Delay band)
    "Worth evaluating for the day and may adjust guidance later,
     but not an immediate trigger."

AQI / AQICN (supplemental, weight 0.4):
  AQI 64 (Moderate)
    Score: 1.0
    "Air quality moderate; sensitive groups should limit prolonged exposure."

USGS Gauge (supplemental, weight 0.5):
  9.86 ft (flood stage 11.0 ft)
    Score: 2.0
    "Below flood stage but rising; monitor."

Iowa DOT Road Conditions (supplemental, weight 0.4):
  Seasonal (normal)
    Omitted from aggregate (absence is not a positive signal, per
    section 2's rule - not scored as 0, simply not counted)

GA 511 / KDKD (narrative, not scored):
  "DOT reports trees/powerlines down in the area."
    Shown for awareness only, does not affect the aggregate score
```

Full output object, incorporating the tiered structure:

```json
{
  "facilityId": "USDA-FSA-IA-CLINTON",
  "posture": "unscheduled_leave_telework",
  "aggregateScore": 3.0,
  "sources": {
    "government": [
      {
        "source": "NWS",
        "signal": "Flood Warning",
        "severity": "Severe",
        "certainty": "Observed",
        "urgency": "Immediate",
        "urgencyNote": "Observed and ongoing - act now.",
        "status": "scored",
        "postureScore": 3.0,
        "weight": 1.0
      }
    ],
    "supplemental": [
      {
        "source": "AQICN",
        "value": 64,
        "valueLabel": "Moderate",
        "postureScore": 1.0,
        "weight": 0.4
      },
      {
        "source": "USGS",
        "value": 9.86,
        "valueUnit": "ft",
        "referenceValue": 11.0,
        "referenceLabel": "flood stage",
        "postureScore": 2.0,
        "weight": 0.5
      },
      {
        "source": "IowaDOT",
        "value": "Seasonal",
        "status": "absent",
        "note": "baseline/normal - omitted from aggregate, not scored as 0"
      }
    ],
    "narrative": [
      {
        "source": "GA511",
        "text": "DOT reports trees/powerlines down in the area.",
        "scored": false
      }
    ]
  },
  "thresholdCrossed": "aggregate 3.0 vs telework cutoff 2.5",
  "confidence": "high (certainty=Observed)",
  "whatWouldChange": "If the NWS Flood Warning is downgraded to an Advisory or certainty drops, aggregate falls below the telework threshold.",
  "rationale": "<templated one-paragraph text, posture-band template with interpolated source/value/urgencyNote>",
  "notification": {
    "recipients": [],
    "message": "",
    "channels": {}
  },
  "decisionRecordId": "<uuid>",
  "recordedAt": "<timestamp>"
}
```

Note: `rationale` field above says "templated" not "generated" — updated
to match the templated-not-LLM decision made after this section was
first drafted (see Decision Log, 2026-10-11).

**Prioritization-for-presentation rule** (resolves the earlier-deferred
question): sort by tier (government > supplemental > narrative), then by
score descending within tier. Urgency is always rendered as a qualifier
string under the relevant entry, never used as a sort key or folded into
the numeric score — keeps the formula in section 3 simple/auditable while
still surfacing timing information where a human needs it most: right
next to the thing it qualifies.

### Open Questions
- [x] **Partially resolved (by implementation)**: `recipients` is fully
      implemented and verified live -- `GET /evaluate`'s `notification.
      recipients` and the roster endpoint both use the real
      applicability rule from section 1 (home roster minus on_detail/
      telework/leave, plus in_office_today exceptions, plus essential
      personnel always). **Still genuinely open** (see section 7's gap
      tracker): `message` (drafted notification text per recipient/
      posture) and `channels` (routing rule, e.g. essential ->
      SMS+email, others -> email-only) are both NOT built. This is
      tracked as the #3 priority in section 7, not duplicated here.
- [x] **Resolved 2026-10-11**: message/rationale text generation is
      **templated, not LLM-generated**. The combination space is small
      and finite (severity tier x certainty tier x posture band x urgency
      qualifier), so templates give fully deterministic, reliable output
      with zero new dependencies (no LLM API key, no latency, no cost) —
      and still satisfy the "plain-language paragraph a manager could
      paste into an email" deliverable without needing generative
      variability. This also simplifies section 6 (architecture): no LLM
      inference path to provision/build around.
      - `urgencyNote` strings: one short template per urgency value
        (Immediate/Expected/Future/Past/Unknown), reusable across all
        sources and facilities.
      - `rationale` paragraph: a template keyed by posture band, with the
        driving source(s) and their values interpolated in
        (e.g. "{facility} is recommended for {posture} due to a {source}
        {signal} ({severity}, {certainty}). {urgencyNote} {whatWouldChange}").

---

## 6. Architecture

**Status: REVIEWED**

### Original Definition

(none — this section was explicitly deferred until sections 1-5 were done)

### Findings

Checked the user's actual day-to-day stack across `~/workspace/ccnx-*`
projects to pick something with near-zero setup friction given ~7-8
remaining build hours. Confirmed pattern: **TypeScript/Node Lambda
functions, Angular frontend, CDK infra** (e.g. `ccnx-record-functions`
has TS Lambda handlers; `ccnx-console-ui`/`ccnx-record-ui` are Angular
apps with `angular.json`; every project has a `.cdk`/`cdk` directory).
Reusing this stack directly rather than introducing something unfamiliar
under time pressure.

Key constraint from the challenge rules: live demo only, no slide decks,
"be signed into your app already" — favors something fully local/
pre-warmed over anything depending on live cloud infra during the pitch
(cold starts, auth hiccups, network blips are all demo-risk with no
upside, since code quality isn't judged).

### Resolved Design

**Local-first, production-shaped.** Build and run everything locally for
the demo; the architecture itself maps directly onto a real AWS
deployment with no redesign — only a deploy step — making this a true
"realness/completeness" story rather than "demo app vs. separate
production design":

- **Backend**: Node + TypeScript, Express, run locally
  (`npm run dev` / plain `node`). Not Lambda-shaped Lambda handlers for
  the demo itself — just a normal long-running server, for simplicity and
  zero cold-start risk during the pitch. **Production path**: this maps
  directly onto API Gateway + Lambda (e.g. via `aws-serverless-express`
  or restructuring routes as individual Lambda handlers, consistent with
  the user's existing CCNX Lambda-function pattern) — no application
  logic changes, just a deployment wrapper.
- **Frontend**: Angular, with Angular's built-in codegen (`ng generate`)
  used even for a couple of pages, to stay consistent with the user's
  real stack rather than hand-rolling something unfamiliar. **Production
  path**: `ng build` output is static files — S3 + CloudFront (optionally
  behind auth later) — again zero application changes, just a deploy
  target.
- **Data**: synthetic facility/employee/schedule data as structured
  JSON/JSONL or YAML on disk (building on `data/synthetic/` already
  created), loaded into an in-memory repository layer at startup.
  **Deliberately key-shaped like a DynamoDB single-table design** (e.g.
  partition key = `facilityId`, sort key patterns for employees/schedule
  entries under that facility) so swapping the in-memory repository for
  a real DynamoDB client later is a thin adapter change, not a data-model
  redesign. Decision records (section 5's output objects) are appended
  to a local JSON file or kept in-memory for the demo; same
  DynamoDB-shaped keying applies (`facilityId` + `recordedAt` as a
  natural partition/sort pair).
- **Live external APIs**: called directly and live during the demo (NWS,
  USGS, AQICN with its provisioned key, Iowa DOT, optionally GA 511/KDKD
  as the stretch delighter) — this is the one piece that's genuinely
  live/networked, matching the challenge's explicit "not a mock feed"
  requirement.
- **CDK**: a `cdk/` folder sketching (not deploying) the production
  shape — Lambda per evaluator or a single evaluation Lambda, EventBridge
  schedule for periodic re-evaluation, DynamoDB for facility/employee/
  decision-record tables, SNS/SES for real notification delivery, S3+
  CloudFront for the Angular build. Shown during the pitch as "here's the
  production deployment path," reusing patterns from the user's actual
  CDK experience. **Not deployed** — written as credible, inspectable
  code, not run.

**UI delighters (confirmed in scope, time-boxed as stretch-after-core):**
1. **Reactive re-evaluation**: a page to edit an employee's
   location/status (the schedule-entry model from section 1) that
   immediately re-runs the applicability rule and updates the
   notification recipient list live — directly demonstrates the
   "employee roster and building roster are frequently not the same
   list" deliverable from the challenge text, interactively rather than
   just in a static output example.
2. **Multi-facility oversight picker**: "pick a state, pick an office,
   see live results for that location" — not meant to imply full
   nationwide data coverage. Purpose is narrower and specific: (a) prove
   a super-user/federal-oversight role can view across facilities, not
   just the single-facility-manager view the challenge text centers on,
   and (b) prove the live-data pull genuinely varies by location (not
   hardcoded to one demo facility). **Seed 5-6 facilities across a small
   number of states** (building on Iowa + Montana already defined, adding
   a few more) — enough to prove the pattern works across locations
   without pretending to model all USDA facilities nationwide.
3. KDKD/custom-source wiring remains the lowest-priority delighter (see
   section 1/4) — only after 1 and 2 above, and only after the core
   pipeline (scoring, tiered output, templated rationale) works
   end-to-end.

**No authn/z** — explicitly out of scope for this POC per user
direction. Not a gap being hidden; worth a one-line callout in the pitch
("auth is out of scope for this POC; a production deployment would gate
the oversight view behind Cognito/IAM").

### Open Questions
- [x] **Resolved (by implementation)**: Express -- built, running,
      verified live throughout. Fastify never needed.
- [x] **Resolved (by implementation)**: in-memory repository layer
      (`server/src/repository/`) keys facilities/employees/schedule by
      `facilityId` as the natural partition key, matching the planned
      DynamoDB shape. File-backed from `data/synthetic/*.yaml`, cached
      in memory after first load (note: this means edits to the YAML
      files require a server restart to take effect -- confirmed
      live, 2026-10-11, when a schedule-note text edit didn't show up
      until restart).
- [x] **Resolved (by implementation)**: Angular models are hand-written
      TypeScript (`ui/src/app/models/facility.model.ts`), manually kept
      in sync with the backend response shape rather than codegen'd
      from an OpenAPI spec. Reasonable for the hackathon's scope and
      timeline; a real OpenAPI-driven codegen setup is a legitimate
      production-roadmap item, not pursued here.

### AWS Migration Plan (documented 2026-10-11, not deployed)

**Verified access, same day**: sourced the provided
`.hackathon-account-auth` export file and confirmed real, working AWS
credentials -- `aws sts get-caller-identity` succeeded as
`WSParticipantRole/Participant` in account `504662347899`
(`us-west-2`), with `AdministratorAccess` attached. This is a live AWS
Workshop Studio participant account, not a dead/placeholder credential
set -- a real deploy is genuinely possible if time allows, not purely
theoretical. One caution found during the check: a Lambda named
`WSConcurrencyCurtailer-DO-NOT-USE` suggests this is a shared/managed
training account with some automatic cleanup or quota enforcement
running -- resources created here may not be permanent and this isn't
a dedicated personal account.

**Why this migration is genuinely low-risk/straightforward** (confirmed
by inspecting our own code, not assumed): every piece of this app was
already built in a shape that maps directly onto an AWS primitive, with
no architectural rework needed -- only a packaging/deploy step per
piece. Concretely:

| Current (local) | Maps to | Why it's a thin change |
|---|---|---|
| Express app (`server/src/index.ts`) | API Gateway (REST or HTTP API) + Lambda | Express route handlers are already small, stateless, request/response functions. Wrapping the existing `app` in `@vendia/serverless-express` (or `aws-serverless-express`) lets ALL current routes run behind one Lambda unchanged -- no handler-by-handler rewrite needed for a first pass. A later optimization could split hot paths (e.g. `/evaluate`) into their own Lambda, but isn't required to deploy. |
| In-memory repository layer, file-backed from YAML (`repository/facilities.ts`, `employees.ts`, `schedule.ts`) | DynamoDB, single-table design | Already keyed by `facilityId` as the natural partition key (a deliberate choice made in section 1, confirmed again when adding San Diego/Pendleton this session -- zero code changes were needed to add new facilities, only data). A DynamoDB-backed `facilities.ts` would implement the exact same `getFacilityById`/`getAllFacilities` function signatures other code already calls -- callers never need to change. |
| `data/decision-records/records.jsonl` (append-only, gitignored) | DynamoDB table, OR S3 (JSONL objects) | Already an append-only, timestamp-ordered log keyed by `facilityId` -- maps directly to a DynamoDB table with `facilityId` partition key + `recordId`/`evaluatedAt` sort key. The query patterns we already use (`getAllDecisionRecords`, `getDecisionRecordsForFacility`) are both trivial DynamoDB queries (scan vs. query-by-partition-key). |
| `data/notification-log/notifications.jsonl` | Same pattern as decision records | Identical shape/reasoning -- separate table, same partition-key design. |
| `data/facility-links/<facilityId>.json` (one file per facility, genuinely read/written at runtime) | DynamoDB item (one row per facility, or an attribute on the facility item) | This is the ONE piece of data in the whole app that's actually mutated at runtime today (not just appended) -- already the smallest, lowest-risk piece to move, and already proves the "real writes work" case before touching anything else. |
| Angular build (`ng build`) | S3 (static hosting) + CloudFront | Zero application code changes -- `ng build` output is already static files. CloudFront in front of S3 for TLS + caching + a real public URL. |
| NWS/NWPS/AQICN/Iowa DOT calls (`sources/*.ts`) | Unchanged -- still direct outbound HTTPS calls from whichever compute runs the backend | These were never local-only; they're real external APIs already. A Lambda calling them needs the same outbound internet access (default for Lambda, no VPC needed since none of these require a private network). |
| AQICN API token (`.env`, `AQICN_API_TOKEN`) | AWS Secrets Manager or Lambda environment variable (encrypted) | `.env` loading is already isolated to one `dotenv.config()` call in `index.ts` -- swapping that for a Secrets Manager fetch (or just a Lambda env var, lower effort) touches one place, not scattered call sites. |
| Hardcoded `localhost:3001`/`localhost:4200` (CORS origin, API base URL) | Real domain names (API Gateway invoke URL or custom domain; CloudFront URL) | Two config values to update (`ApiService.baseUrl` in Angular, `cors({ origin: ... })` in Express) -- not a redesign, just pointing at real URLs instead of localhost. |

**What's NOT in this table because it genuinely doesn't exist yet**:
real email/SMS dispatch (SNS for SMS, SES for email) -- the
notification log currently only records what WOULD be sent, by design
(user: "let's start out with just logged"). Wiring real dispatch is a
natural next step once the rest is deployed -- SNS `Publish` for SMS
(topic-less, direct-to-phone-number publish) and SES `SendEmail` are
both simple, well-documented APIs with no architectural prerequisite
beyond having a verified sender identity (SES) and a numbers budget
(SNS, which costs real money per SMS -- worth flagging before wiring
up for real, unlike everything else in this table which is free-tier-
friendly for a demo's volume).

**Suggested deployment order** (if pursued): (1) DynamoDB tables first
(cheapest, zero risk, can run in parallel with the still-working local
file-backed version), (2) Lambda + API Gateway wrapping the existing
Express app unchanged via `serverless-express`, pointed at the new
DynamoDB-backed repository layer, (3) S3 + CloudFront for the Angular
build, pointed at the new API Gateway URL, (4) optionally, SNS/SES for
real notification dispatch last, since it's the only genuinely new
capability (everything else is a deploy target swap for existing
logic). CDK (not CloudFormation console clicking) would define all of
this, consistent with the user's actual CCNX CDK experience referenced
earlier in this section.

**Deliberately not done**: no authn/z was in scope for the local demo
and remains out of scope here too -- a real deployment would need
Cognito (or IAM-gated API Gateway) in front of this before it's
actually safe to expose beyond a demo, but that's a distinct piece of
work from the migration itself and shouldn't block documenting the
migration path.

**Actually attempted this session (2026-10-11, post-submission), not
just planned**: built and deployed the read-only API slice for real,
not just sketched it. Extracted the Express `app` out of `index.ts`
into `app.ts` (exported, no `.listen()` call) so the exact same app
can run two ways with zero duplicated route logic: `index.ts` (local
dev, unchanged behavior, still the default/working path) and
`lambda.ts` (new, wraps `app` with `@vendia/serverless-express`).
Built a deployment zip (`server/dist` + `node_modules` + `data/`,
matching the exact relative-path structure `repository/dataPaths.ts`
expects), created a real Lambda function via plain `aws lambda
create-function` (no CDK, per user's call that it wasn't worth it for
a one-off), and verified it end-to-end with a REAL live NWS call
through `aws lambda invoke` -- correct posture, correct facility name,
same result as the local server.

**Finding: public/unauthenticated access is blocked at the AWS
Organizations level in this specific Workshop Studio account; direct
IAM-authenticated invocation is NOT blocked.** Precisely isolated via
three real tests, not assumed:
1. API Gateway (HTTP API, AWS_PROXY integration, correct resource-based
   Lambda permission, confirmed-correct `SourceArn` condition) returned
   a bare `500 Internal Server Error` on every request, with ZERO
   corresponding log entries in CloudWatch (API Gateway access logs),
   CloudWatch (Lambda logs), or CloudTrail (`Invoke` events) -- the
   call never actually reached the function.
2. A public Lambda Function URL (`AuthType: NONE`, explicit
   `Principal: "*"` resource policy) returned a direct
   `403 Forbidden: AccessDeniedException` from Lambda's own URL
   front door, before even reaching the function.
3. The SAME Function URL switched to `AuthType: AWS_IAM`, invoked with
   a real SigV4-signed request (signed using the account's own
   `WSParticipantRole` credentials via `botocore`), returned a correct
   `200 OK` with real, live NWS data -- `aws iam simulate-principal-
   policy` also confirmed no identity-based SCP blocks
   `lambda:InvokeFunction` for this role.

Conclusion: this account's guardrail specifically targets *public,
unauthenticated* invocation paths (consistent with a shared training
account preventing participants from standing up open internet
endpoints) -- it is NOT a blanket restriction on Lambda hosting itself,
and is not something fixable from within this participant account
(confirmed we lack `organizations:DescribeOrganization` permission to
even inspect the policy). A production AWS account without this
specific guardrail would deploy exactly as planned above with no
changes needed. The practical gap this leaves: a browser-based Angular
UI can't SigV4-sign its own requests without real plumbing (a Cognito
Identity Pool handing out temporary signable credentials, or a thin
signing proxy) -- not attempted, since the demo/pitch was already
submitted and recorded by this point and the finding itself (hosting
works, only unauthenticated access is restricted) was the valuable
thing to nail down, not a fully-wired browser-to-Lambda auth flow.

All test resources (Lambda function, IAM role, API Gateway, Function
URL configs) were created, tested, and fully deleted again after each
test -- nothing left running in the account.

---

## 7. Challenge Requirements Checklist & Gap Tracker

**Status: ACTIVE — reviewed against the original challenge text,
2026-10-11.** This section replaces the earlier "Build Plan / Time
Budget" placeholder, which we decided not to need (check-ins instead of
a detailed hour budget). This is the authoritative tracker for "did we
actually build what was asked" — update it as gaps close, don't let it
go stale like the deliverable fields did before this review caught it.

### Scope: the data
- [x] NWS/NOAA core source — live, no key, zone-based lookup
- [x] Facility model (synthetic): location, hours, employee assignments,
      essential-personnel flags, telework eligibility
- [x] **Closed 2026-10-11.** `accessibilityNotes` -- `/evaluate` now
      also returns `address`/`hours`/`buildingType`/`accessibilityNotes`
      (previously only `facilityName`), displayed as a compact detail
      line under the posture header. Also answers an earlier open
      question ("should we show basic facility info toward the top of
      the page") -- same fix covers both.
- [x] **Closed 2026-10-13.** Re-read of the original challenge text's
      facility-model sentence ("location, hours, employee assignments,
      essential-personnel flags, telework eligibility, accessibility
      needs") found that most of that list -- employee assignments,
      essential-personnel flags, telework eligibility, AND accessibility
      needs -- are per-EMPLOYEE concepts, despite being filed under
      "facility" in the sentence. essential-personnel/telework-eligible
      were already correctly modeled on `Employee` from the start; what
      was missing: (1) per-employee working hours when they differ from
      the facility's posted hours (e.g. a field ranger's actual patrol
      schedule), (2) a per-employee accessibility accommodation note,
      distinct from `Facility.accessibilityNotes` (which describes the
      BUILDING, e.g. "ground-floor ADA accessible" -- a legitimate,
      separate concept, kept as-is). Added `Employee.workHours` and
      `Employee.accessibilityNotes` -- both purely informational
      (display-only on the roster table, under the employee's name),
      per user: "notes are purely data-model, not something to take
      actual action on through logic." Deliberately does not feed
      scoring, posture, or notification wording -- consistent with the
      project's "we make zero decisions on anyone's behalf" posture.
      Seeded two real examples: Skylar Petrov (Pendleton, OR field
      ranger with an earlier patrol schedule) and Devon Marsh (Kansas
      City, MO facility manager with a mobility-accommodation note,
      modeling the user's own example: a ramp not being de-iced is
      grounds for a manager to approve ad hoc telework for that one
      person without declaring a facility-wide closure).
- [x] At least one supplementary signal — exceeded: USGS/NWPS (river
      gauge) + AQICN (air quality) + **Iowa DOT road conditions (added
      2026-10-11)**, all real/live/scored. GA 511/KDKD exist as
      narrative-only stretch sources.
      **Iowa DOT implementation note**: `server/src/sources/iowaDot.ts`
      + `evaluator/iowaDotScoring.ts`. Confirmed live, free, no key --
      ArcGIS FeatureServer spatial query (`geometry`+`distance`+`units`
      params), returning road segments within 10 miles of a facility
      point rather than fetching the full ~1000-segment statewide feed.
      Scores the WORST condition found among nearby segments using the
      confirmed 5-value legend (Impassable > Travel Not Advised >
      Completely Covered > Partially Covered > Seasonal), scored off
      the STRING `ROAD_CONDITION` field (not the numeric code, whose
      full mapping was never independently confirmed beyond
      `Seasonal=10` -- see section 1's existing Open Questions
      resolution). "All nearby segments Seasonal" is `absent`, not a
      scored 0, consistent with section 2's "absence is not evidence of
      normalcy" rule. Iowa-only (`isApplicable` checks
      `facility.address.state === "IA"`) -- this is a per-state
      platform, not nationwide; other states' CARS511 instances exist
      but aren't wired up. Verified live: Clinton (IA) correctly
      includes it (9 segments checked, all Seasonal -> absent); Great
      Falls (MT) correctly excludes it entirely, not even attempted.
      This is the registry-refactor payoff from earlier the same day --
      adding this 3rd source required zero changes to runEvaluation's
      control flow, just one new adapter file + one registry entry.

### Scope: the decision logic
- [x] Graded recommendation, not binary — five-band posture ladder,
      fixture-validated
- [x] "One facility profile and two or three hazard types" — Iowa
      (flood, primary) + Montana (winter storm, secondary); within the
      explicit out-of-scope guidance, not over-built

### Scope: the notification
- [x] Right people — applicability rule (section 1), verified against
      synthetic data including the roster-vs-building-list distinction
- [x] **Closed 2026-10-11.** Right channel — per-recipient email/SMS
      selector (`server/src/notification/templates.ts` builds both a
      long-form/email and short-form/SMS variant; SMS is disabled in
      the UI when there's no short-form variant, e.g. "normal"
      posture). Channel choice is manual per recipient, not an
      automatic essential->SMS rule -- see design note below for why.
- [x] **Closed 2026-10-11.** Drafted message content --
      `buildNotificationMessages()` produces both message lengths,
      keyed by posture band + essential-personnel flag + driving
      signal name. Facility name always stated once in the opening
      line (per user: someone on detail elsewhere or working an
      exception schedule needs to know WHICH facility's posture this
      is about). Essential personnel get one single, identical,
      clearly-separated line regardless of posture ("ESSENTIAL
      PERSONNEL: This does not change your schedule or reporting
      requirement.") -- not a posture-specific paragraph, since their
      situation genuinely doesn't vary by posture band (several rounds
      of user feedback converged on this: first draft had posture-
      specific essential wording that was inconsistent across bands
      and included unneeded repetition of the facility name/time
      language that added nothing).

**Design note on channel routing** (per user, 2026-10-11): the real
urgency problem isn't "essential vs non-essential gets a different
channel," it's TIMING relative to when someone would otherwise leave
the house. Essential personnel come in regardless, so there's no time
pressure on their message. Non-essential staff being told to stay home
need that message to land fast -- that's the case needing a short-form/
SMS variant, directly addressing the challenge's "before they've
already left the house" framing. This is why short-form exists per
POSTURE, not per essential-flag.

### Deliverable 1: Working system, live demo
- [x] Confirmed repeatedly throughout the build against real live NWS/
      USGS/AQICN data, not mocked

### Deliverable 2: Recommendation with reasoning
- [x] Recommended posture
- [x] Every input with source and timestamp (visible per-source; UI
      now also shows a human-readable "last updated" per card,
      2026-10-11)
- [x] **Closed 2026-10-11.** "Which threshold was crossed and by how
      much," confidence, and "what would change the recommendation" --
      implemented in `server/src/evaluator/explain.ts`
      (`buildExplanation`), derived from the same `drivingSource`/
      `recommendedScore` that already powers the rationale paragraph
      (no new scoring logic). Wired into both the live `/evaluate`
      response and persisted on decision records (so reconstructed
      history shows the full explanation, not just the rationale text).
      UI: dashboard and decision-log both show these as "Why this
      level" / "How sure" / "What to watch for" -- reworded from the
      literal field names after a user flag that the original labels
      ("Threshold crossed" / "Confidence" / "What would change this")
      read as restating the challenge's deliverable bullet rather than
      normal product copy. Old decision records persisted before this
      field existed show "— not recorded for this decision" instead of
      a blank line (verified live against a real pre-existing record).
- [x] One-paragraph plain-language rationale — implemented, templated,
      verified live

### Deliverable 3: Notification package
- [x] Recipient list with inclusion/exclusion logic (roster view +
      applicability reasons)
- [x] **Closed 2026-10-11.** Drafted message -- see "Scope: the
      notification" above
- [x] **Closed 2026-10-11.** Channel routing -- see "Scope: the
      notification" above
- [x] **Closed 2026-10-11, bonus beyond the literal deliverable text.**
      Actual send/audit mechanism: per-recipient "Notify" button + a
      "Notify All" button (with a "skip confirmation" checkbox for
      fewer clicks on repeat sends, still fully logged either way),
      plus a read-only copy/paste preview textarea for the drafted
      message ("in case it needs to be sent another way" -- per user).
      Logged-only for now, no real email/SMS dispatch (per user:
      "let's start out with just logged. if we have time, we can set
      things up in our demo aws account" -- real dispatch via the demo
      AWS account remains a stretch item). Persisted as its OWN
      append-only JSONL log (`data/notification-log/notifications.jsonl`,
      `server/src/repository/notificationLog.ts`), explicitly SEPARATE
      from decision records per user: "I'd say audit as a separate
      log" -- recording a decision and sending notifications are
      different actions that may not happen at the same moment.
      Each entry carries an optional `decisionRecordId` link but is
      independently queryable (`GET /api/facilities/:id/notifications`).
      UI: shown in a new "Notification Send Log" section below decision
      history in `DecisionLogComponent`.
      **UX refinement (same day)**: the full notify panel (buttons,
      channel selectors, preview) is disproportionate for a routine
      Normal Operations day where nothing needs to happen -- collapses
      to a one-line summary ("Nothing currently warrants notifying
      anyone") for `normal` posture, auto-expanding for any non-normal
      posture. Collapsed state stays one click from the full panel via
      a native `<details>` disclosure ("Notify anyway...") -- per user:
      a facility manager might need to notify everyone for a reason
      entirely outside the tracked data sources (e.g. a power outage),
      and the system's job is to surface what it knows, not gate
      actions it didn't anticipate.

### Deliverable 4: The decision record
- [x] **Resolved 2026-10-11, redesigned same day.** Implemented in
      `server/src/repository/decisionRecord.ts`, persisted as append-
      only JSONL (`data/decision-records/records.jsonl`, gitignored —
      runtime data, not source). **Current model (post-redesign)**:
      `GET /api/facilities/:id/evaluate` is purely read-only and
      persists NOTHING -- viewing/refreshing the dashboard is not a
      decision. `POST /api/facilities/:id/decisions` is the ONLY route
      that writes a record, representing an explicit human action.
      It re-runs a fresh evaluation at the moment of the decision
      (not stale client state), accepts an optional `decidedPosture`
      override plus `decidedBy`/`notes`, and records BOTH
      `recommendedPosture` (what the system suggested) and the actually
      -decided `posture`, with a `wasOverridden` flag -- a human
      overriding the system is a first-class, expected case per the
      challenge's "the goal is not to automate the decision," not an
      edge case. Each record also carries, per input, its own
      `sourceReportedAt` (dual-timestamp distinction: "when we decided"
      vs. "when the source itself last updated" -- NWS `effective`,
      NWPS `validTime`, AQICN `time.iso`). Retrieval:
      `GET /api/decision-records` (optional `?facilityId=`) and
      `GET /api/decision-records/:recordId`. Resilient to a corrupted
      line in the file (skipped with a logged warning, not a crash --
      verified live). UI: "Record This Decision" form (posture
      override dropdown, decided-by, notes, confirm button, clears on
      successful submit) plus `DecisionLogComponent` showing expandable
      per-record cards including `decidedBy`/`decisionNotes`/override
      flag, embedded in the facility dashboard.

### Deliverable 5: Threshold defensibility
- [x] Strong — CAP spec citations (official OASIS/NWS enumeration
      definitions), EPA AQI breakpoints, NWS's own flood category
      thresholds for the specific gauge in use. All real, all cited,
      all documented in section 3/4 with sources.

### Net priority order for remaining time (updated 2026-10-11, end of day)
1. ~~Decision record persistence~~ — **done**, redesigned same day to
   be explicit-action-only (`POST /decisions`), not auto-persisted on
   every view
2. ~~Restore `thresholdCrossed` / `confidence` / `whatWouldChange`~~ —
   **done**, see Deliverable 2 above
3. ~~Notification message + channel routing~~ — **done**, see
   Deliverable 3 above
4. ~~Display `accessibilityNotes`~~ — **done** (same pass as the
   facility detail/profile section work -- see Deliverable section
   above and "Scope: the data" checklist).
5. ~~Supplemental-source refactor follow-on (Iowa DOT)~~ — **done**,
   see section 1 above
6. ~~Verify new locations handled with zero code changes~~ — **done**,
   see section 1's "Verification" note above (San Diego CA, Pendleton OR)
7. **Closed 2026-10-11.** Per-facility custom reference links --
   lets a facility manager attach curated (not scored/fetched) links
   specific to one facility, generalizing the KDKD/GA-511 finding from
   section 1 into a reusable feature instead of a one-off adapter.
   `server/src/repository/facilityLinks.ts` -- genuinely writable at
   runtime (unlike the rest of the facility record, which stays
   read-only seed data per the design discussion below), one JSON file
   per facility under `data/facility-links/` (gitignored, runtime
   data). Full CRUD: `GET/POST /api/facilities/:id/links`,
   `DELETE /api/facilities/:id/links/:linkId`, URL validated
   server-side (`isValidHttpUrl`) before being accepted. New route
   `/facility/:id/edit` (`FacilityEditComponent`) shows the rest of the
   facility record READ-ONLY alongside the editable links list.
   **Design decision (same day)**: scoped to links only, not full
   facility editing -- `facilities.yaml` is hand-authored seed data
   cached in memory at server start (see `repository/facilities.ts`);
   making coordinates/riverGaugeId editable would need real file-
   rewrite + cache-invalidation work, and a bad lat/lon edit could
   silently break that facility's NWS zone resolution with no obvious
   error pointing back at the edit. Links are safe to make writable
   because nothing else in the system depends on them. Dashboard also
   got more prominent facility details (bigger bordered block instead
   of a thin muted line) as part of the same change, directly
   addressing an earlier open question about surfacing basic facility
   info toward the top of the page.
All items on this list are now closed. Remaining work is genuinely
stretch (config UI for other registry internals, AWS migration,
presentation/demo prep) -- see later sections of this doc and the
Decision Log for anything added after this point.

**Post-submission fixes (2026-10-11, after the live demo)**:
1. Day-of-week added to notification message text (`notification/
   templates.ts` `formatLongDate`/`formatShortDate`) -- was previously
   just the raw `YYYY-MM-DD` string, forcing the reader to do date
   math to confirm it was actually "today."
2. **Essential personnel on leave are no longer notified** -- found
   via user question: "isn't 'on leave' just a general status? even
   if someone isn't essential, if they're on leave, they wouldn't
   necessarily need an emergency alert." Correct insight: `leave` is
   not a facility-posture exception, it's a general not-working-today
   status, irrelevant to essential-personnel status. Fixed in
   `repository/applicability.ts`'s `getNotificationRecipients()` --
   previously this function added EVERY essential employee not
   already included with no schedule check at all, silently notifying
   someone on approved leave with the same label as someone on a
   completely normal day. Now: `leave` excludes regardless of
   essential status; `on_detail`/`telework` still include essential
   personnel (they're genuinely still working, just elsewhere that
   day) under a new, clearly-labeled reason code
   (`essential_despite_schedule_exception`), with the schedule note
   surfaced so it's visible WHY/where. Verified live both branches
   (temporarily seeded then removed a test leave entry and a test
   telework entry for the same essential employee, confirmed excluded
   vs. included+labeled correctly in each case).

Also closed this round, found via user manual-testing/screenshot review
(not originally on this list, but real fixes, not scope creep):
decision-record spam -> redesigned to explicit-action model; decision
log stale-state bug on facility switch; misleading "Affected Today"
roster column label -> renamed "Would Be Notified"; raw-enum text in a
schedule note ("full_remote" inline) -> natural language; "no
government data available" wasn't visually prominent -> new banner;
decision form didn't clear on submit and didn't display decidedBy/
notes -> both fixed; single-facility-per-state in the picker -> added
Des Moines (IA) and Great Falls (MT).

**Second round of closures (2026-10-11, later session)**: hardcoded
3-source array in `runEvaluation` -> refactored to a
`SupplementalAdapter` registry (NWS stays hardcoded per challenge's "the
core source" framing; USGS/AQICN implement the interface) --
`server/src/sources/supplementalAdapter.ts`; NWS zone-record duplication
(same warning issued as multiple CAP records with identical
severity/certainty/urgency but different `areaDesc`) -> collapsed by
headline server-side (`collapseByHeadline` in `nws.ts`), merged area
list always shown as a plain bullet list rather than hidden behind a
disclosure (simplified after user feedback that an expand/collapse was
unnecessary machinery for short text); captured and surfaced previously-
discarded real NWS fields (`onset`, `ends`, `expires`, `description`,
`instruction`) -- description/instruction shown via an expandable "Full
NWS alert text" detail; AQICN station-distance check converted km ->
miles (USDA/US audience, consistent with gauge height already being in
feet); literal `--` double-hyphen -> real em dash and posture-label
emphasis markers throughout rationale text; "no government sources"
muted one-liner reworded so it reads as "checked, nothing active" not
"missing/unchecked" (Des Moines screenshot flag); decision-form
placement actually moved below the data sections (was proposed earlier
but never executed -- caught when user re-flagged it); decision-log
override display now shows a labeled "System's reasoning at the time"
lead-in instead of the overridden rationale reading as unexplained
leftover text; multiple instances of UI copy that mirrored the challenge
brief's own sentence structure reworded to read as normal product
copy, not a deliverable checklist being narrated (decision-log hint
text, the three new explanation field labels).

### Confirmed behavior: evaluation is always against current-moment
### weather, regardless of requested schedule date (2026-10-11)

User asked whether the system accounts for future/scheduled dates, or
always decides based on the current moment. Checked the actual route
code directly rather than relying on memory:

`GET /api/facilities/:id/evaluate?date=YYYY-MM-DD` — the `date` param
is threaded through ONLY to the employee schedule/notification lookup
(`getScheduleEntries`/`getApplicableEmployees`/`getNotificationRecipients`).
It is NOT passed to `evaluateNwsAlerts`/`evaluateUsgsGaugeHeight`/
`evaluateAqicn` at all -- those three always call the live/current-
moment APIs, with no date parameter supported by the adapters.

**Net behavior**: the system always answers "given RIGHT NOW's weather,
what should posture be for the staffing on DATE X." It does NOT do
forecast-based evaluation for a future date (e.g. "what will Thursday's
weather require" using an actual weather forecast). This is reasonable
for the normal use case (deciding today's posture using today's
schedule) but would be misleading if `date` were used to ask about a
day further out, expecting forecast-aware reasoning -- we'd silently
substitute today's weather instead.

This also directly answers why a `Future`-urgency NWS alert (e.g. a
Watch) doesn't get any special date-aware treatment: it's scored at
face value by the CAP formula (lower certainty modifier, landing lower
on the posture ladder) same as any other alert, right now. There is no
logic that reduces or defers action based on how far out `urgency:
Future` implies the hazard is -- this is a known simplification, not a
bug, but worth being precise about in the pitch so we don't imply
real forecasting capability we don't have.

**Not fixed this round** -- noted here as a known limitation /
potential future enhancement (NWS does expose a separate forecast
endpoint, `/gridpoints/.../forecast`, found during early data-source
scoping but never built into an adapter -- see section 1's "Other
Potential Future Inputs").

---

## Decision Log

Running log of decisions made and why, so we don't re-litigate under time
pressure later.

- **2026-10-10**: Hit live `api.weather.gov/alerts/active`. Found Air
  Quality Alert returns `Unknown` for severity/certainty/urgency across all
  live instances checked (9/9) — unscorable. Dropped as a hazard type /
  dropped AirNow as supplementary source.
- **2026-10-10**: Instead of one hazard type + a derived synthetic
  secondary signal, going with **two real NWS hazard types**: Flood
  Warning (Iowa, `Severe/Observed/Immediate` live) and Winter Storm Warning
  (Montana, `Severe/Likely/Expected`, 9 active live). Stronger
  "realness/completeness" demo than one real + one synthetic.
- **2026-10-10**: Added `status: scored | insufficient_data` to the
  evaluation outcome schema so the system surfaces alerts it can't
  confidently score, instead of fabricating a weighted value. Framed as a
  defensibility feature for the pitch.
- **2026-10-10**: Confirmed via `/openapi.json` that `point` and `zone` are
  mutually exclusive query params, and live-tested `point` against a real
  Clinton County, IA flood warning — got a **false negative**. `zone=
  IAC045` correctly returned it. Facility profile will store lat/lon (plus
  human-readable address/city/state for manager-facing lookup); the system
  resolves county/forecast zone at runtime via `GET /points/{lat},{lon}`
  rather than hand-maintaining zone codes.
- **2026-10-10**: Confirmed NWS has no city/state-to-coordinate geocoding
  endpoint (only coordinate-to-zone, the reverse direction). Facility data
  model therefore carries both a human-identity block (name/address/city/
  state — how a facility manager finds their own facility) and a
  machine-identity block (lat/lon — what drives the NWS calls), with zone
  codes always resolved live rather than stored as authoritative.
- **2026-10-10 (correction)**: Lat/lon doesn't need a "runtime translation
  layer" framing — since all facility data is synthetic, we author lat/lon
  directly at creation time (as if a geocoder ran once at registration,
  same as a real system). Address/city/state and lat/lon are just both
  part of the authored record, no derivation step needed for that part
  (zone resolution via `/points` is still done live, that part stands).
- **2026-10-10**: Caught that having two NWS hazard types (flood + winter
  storm) does NOT satisfy the challenge's "at least one supplementary
  signal" requirement — it's one data source (NWS) exercised twice, not a
  second source. Checked live for Gulf hurricane activity (none active in
  the Gulf specifically right now) and found **NHC `CurrentStorms.json`**
  (`nhc.noaa.gov/CurrentStorms.json`, free, no key) as a genuinely distinct
  second data source — numeric/continuous (intensity in kt, pressure,
  track position) rather than NWS's categorical taxonomy. Live right now:
  Post-Tropical Cyclone Isaias, inland Alabama (33.5N/-86.9W), real USDA
  ag/forestry territory. This becomes the required supplementary signal,
  demoed as a stretch third facility/scenario (Alabama) if time allows
  after the core Iowa+Montana NWS pipeline works. Also found a live
  Tropical Storm Watch (San Diego, CA) via NWS alerts —
  `Severe/Possible/Future` — a good concrete example of the "upcoming but
  unknown" low-certainty case worth handling on the posture ladder.
- **2026-10-10**: Fixed employee data model — challenge text explicitly
  states "the employee roster and the building roster are frequently not
  the same list" (detail assignments, remote work, etc.). Split the single
  `facilityId`/`currentStatus` pair into `assignedFacilityId` (home
  building) vs `currentFacilityId` (where they actually are this week).
  Notification recipient logic (section 5) must key off
  `currentFacilityId`, not `assignedFacilityId`.
- **2026-10-10**: Section 4 weighting (0.7 NWS / 0.3 secondary) reinstated
  now that NHC is a real secondary source — only applies when both NWS and
  NHC signals are present for a facility (the Alabama/Isaias scenario); the
  core Iowa/Montana demos only ever have one applicable signal (NWS), so
  weighting math is moot for those and the raw NWS score is used directly.
- **2026-10-10**: User spotted live tornadic activity on East Coast radar
  (SC/GA). Confirmed via API: active **Tornado Warning**, Aiken/Lexington/
  Saluda SC, `Extreme/Observed/Immediate` — the single highest-severity
  combination in the NWS taxonomy, live right now. Confirmed this is the
  **same data source/model** as flood and winter storm (still
  `api.weather.gov/alerts/active`, same fields) — just a different `event`
  value, not a new feed. Decision: include as a demo scenario (strongest
  possible single-alert example for the 3-min pitch — "most severe
  combination the taxonomy has, happening right now"), but it does **not**
  count toward the supplementary-signal requirement. NHC remains the only
  distinct second source identified.
- **2026-10-10**: User correctly pushed back on the tornado-vs-flood
  "different data source" framing — same NWS feed/taxonomy regardless of
  event name is not a new source. Clarified the actual test: structurally
  different field shape (categorical vs. numeric), not event name.
  Re-checked other sources named in the challenge text directly: **USGS
  Water Services** (free, no key) confirmed live with a real gauge at
  Clinton, IA (9.86 ft, same facility as our primary demo) — now the lead
  supplementary-signal candidate, hyper-local rather than requiring a
  separate facility. State DOT/511 confirmed **not available** as a public
  no-key API (Iowa 511 is HTML-only); ruled out for this build, flagged as
  a production-roadmap item.
- **2026-10-10**: User provided a working **AQICN** (api.waqi.info) API
  token (stored in `.env`, gitignored, not in this doc). Confirmed live:
  `geo:{lat};{lon}` lookup returns real AQI (64) + sub-indices for Clinton,
  IA. This reverses the earlier "air quality: dropped" call — that
  decision was about NWS's own Air Quality Alert event (Unknown fields)
  and AirNow specifically (confirmed needs a key we didn't have). AQICN is
  a different, working provider. Air quality is back in scope via AQICN,
  as a second supplementary signal alongside USGS gauge height, both
  layered onto the existing Iowa facility rather than standing up a new
  one. NHC/Alabama demoted to stretch-only.
- **2026-10-10**: User supplied three specific DOT/GIS leads (Iowa DOT
  ArcGIS, SC DOT ArcGIS portal, GA 511 alerts endpoint found via network
  capture). Checked all three live. Iowa DOT GIS is genuinely public
  (confirmed, no key) but the relevant folders (`RWIS`, `Emergency`) are
  either empty or token-gated; no usable live condition data found. SC DOT
  portal is public but didn't resolve the specific REST service endpoint
  in the time available. **GA 511 `GetUpdatedAlerts` confirmed fully
  working, no key** — and found a live, directly relevant "Hurricane
  Isaias Impacts" alert for the GA/SC region tying into our tornado lead
  demo. However: the feed is unstructured free text with no severity/
  numeric field, so it can't feed the scoring evaluator — it's being used
  as rationale/notification narrative enrichment only (shown, not scored,
  same spirit as the `insufficient_data` pattern from section 2/3, applied
  here to a source that has literally no structured field rather than an
  `Unknown` placeholder value).
- **2026-10-10**: User corrected that the SC "portal" lead was for public
  comments, not road conditions — dropped as not pertinent. User supplied
  two further leads: `511_IA_Road_Conditions_View` and
  `CARS511_MN_Events_View`, both ArcGIS FeatureServer `query` endpoints.
  Confirmed both live, no key. **Iowa's feed has a genuinely scorable
  numeric field (`ROAD_CONDITION_CODE`)** — corrects the earlier (round 2)
  conclusion that no usable Iowa DOT condition data existed; it does, just
  wasn't found by browsing the generic ArcGIS folder tree. All 1014 current
  Iowa segments read code `10`/"Seasonal" (normal) right now, consistent
  with no active IA weather event. No domain/legend for other code values
  found via the API — flagged as an open question rather than guessed.
  Minnesota's CARS511 events feed has a scorable `Priority` field in
  principle but current live data is construction-only, not weather, and
  MN isn't one of our facility states — documented as a future input, not
  built this round. Also captured a list of other plausible future inputs
  (other states' CARS511 feeds, power outage data, school closures, NWS
  gridpoints forecast, NWS observations) per user's request to document
  potential inputs even where not built/verified this hackathon.
- **2026-10-11**: User framed the project's actual role precisely: the
  system prioritizes/scores *information*, it does not make the closure
  decision. Corollary: absence of a signal (no active alert, Iowa DOT at
  baseline) is still meaningful but must be **neutral/omitted**, never
  scored as a positive "normal" data point that could dilute a present
  hazard signal from another source. Section 2's resolved design updated
  with this principle; section 4's weighting/averaging must only average
  over present signals, not default-fill absent ones to 0.
- **2026-10-11**: Set up `data/fixtures/` (real captured API responses,
  2026-10-10/11, one YAML per source — NWS x4 scenarios, NHC, USGS, AQICN,
  Iowa DOT CARS511, GA 511) and `data/synthetic/` (authored facility +
  employee records matching the section 1 schema) so findings/data persist
  on disk, independent of session memory. README in `data/fixtures/`
  explains provenance and that live data will have moved on by demo time.
  Confirmed the SC tornado warning observed earlier has since cleared;
  kept as `nws-alert-tornado-warning-cleared.yaml`, an intentional example
  of a normal "no active alert" response shape.
  Also confirmed, via the Iowa road-conditions service metadata, that its
  real name is **"Iowa DOT Winter Road Conditions"** — explains why all
  live segments read baseline today (no active IA winter event), and ties
  this source thematically to the Montana winter-storm scenario even
  though it's hosted under Iowa's endpoint.
- **2026-10-11**: User asked about IA flooding and GA/NC tornado status —
  re-checked live. **IA flood warning is still active and unchanged**
  (`Severe/Observed/Immediate`, Clinton/Scott Co.). The SC tornado warning
  has genuinely cleared, confirmed no active Tornado Warning/Watch in
  GA or NC either. However, broad-area check of GA/NC turned up **active
  flooding** instead: a live `Severe/Observed/Immediate` **Flood Warning
  in Cleveland, NC**, plus several `Severe/Observed/Immediate` Flood
  Warnings across GA (Grady/Thomas, Brantley, Baker/Nassau/Charlton
  counties). **Lead demo scenario updated: GA/NC facility, Flood Warning**
  (not tornado — that was accurate when first observed but has since
  passed). This also pairs more naturally with the already-built GA 511
  narrative-only road alert source than the tornado framing did. Facility
  record in `data/synthetic/facilities.yaml` for Aiken, SC should be
  reconsidered/relocated nearer Cleveland, NC or the GA flood counties
  before final build.
- **2026-10-11**: Redesigned employee data model after user feedback.
  Original `assignedFacilityId`/`currentFacilityId`/`currentStatus`
  fields-on-employee conflated identity with day-specific fact, and only
  expressed one direction of exception (assigned-but-elsewhere), not the
  other (normally-remote-but-in-office-today). New model: `employee`
  (stable identity, `homeFacilityId`, `remoteStatus`) + facility roster as
  a derived query (not stored) + `schedule-entries` (date + facility +
  list of exceptions only). Added an explicit "who's applicable at a
  facility today" rule combining both directions. Updated
  `data/synthetic/employees.yaml`, added `data/synthetic/
  schedule-entries.yaml`, updated `data/synthetic/facilities.yaml`
  (removed the stale SC tornado-based facility).
- **2026-10-11**: Confirmed explicit scope boundary — system evaluates
  facility/location conditions, not individual employee commute routes.
  Commute-route modeling is out of scope; the human decision-maker handles
  individual judgment calls, the system's job is correctly identifying who
  is in the "would be affected" set per facility, not modeling how each
  person gets there.
- **2026-10-11**: Finalized demo scenario lineup: Iowa (flood) as
  primary/lead — most stable, most fully fixture-backed — with Montana
  (winter storm) as secondary, and GA/NC flood activity mentioned as a
  narrative-only regional-awareness note rather than built out as a
  fourth facility. Prioritizing demo stability over continuing to chase
  whichever hazard is most dramatic at any given moment (lesson from the
  SC tornado -> cleared, GA/NC tornado -> flood shifts observed live
  during scoping).
- **2026-10-11**: Initialized git repo (`git init`, default branch
  renamed to `main`). Confirmed `.env` correctly ignored before first
  commit (`git status --ignored`). First commit covers `docs/`, `data/`,
  `.gitignore` — no secrets included.
- **2026-10-11**: User found and supplied a request pattern for KDKD
  (mykdkd.com) school/business closings for the Clinton, IA area —
  surfaced because Clinton's own school district links to it as their
  closure-notification source. Tested live: confirmed working, no auth
  session required despite initial appearance (`chkClo` token is embedded
  in the public closings page HTML, not tied to the `PHPSESSID` cookie;
  verified a bogus token fails but the scraped real one succeeds with no
  cookie at all). One transient `error` response on a repeat identical
  request did not reproduce on retry — treated as a blip, not a real
  session requirement. Captured as `data/fixtures/
  kdkd-clinton-ia-closings.yaml`. This becomes the worked example for a
  documented (not built) "custom per-facility narrative source" extension
  pattern — see section 4.
- **2026-10-11**: Finalized the cross-source standardization model per
  user's framing (NWS highest weight as the explicitly-named official
  source, supplemental sources lower, narrative sources unscored). Common
  0-4 "posture pressure" scale; each source has its own native-unit
  conversion into that scale (not rescaled relative to each other);
  weighting (not scale distortion) expresses source priority. Aggregation
  is a weighted average over only present/scored sources — ties directly
  back to the earlier "absence is not evidence of normalcy" principle.
  Weights set: NWS 1.0, USGS 0.5, AQICN 0.4, Iowa DOT 0.4 (pending scale
  docs), NHC 0.3, GA 511/KDKD 0 (narrative-only). Documented in section 4.
- **2026-10-11**: Resolved the Iowa DOT road-condition scale open
  question. User supplied the ArcGIS Hub "about" page; the page itself
  was JS-rendered and not fetchable, but following the dataset back to
  its underlying FeatureServer and checking the **MapServer layer's
  `drawingInfo.renderer`** revealed a complete, authoritative 5-state
  legend (the same categories/ordering ArcGIS uses to color the live
  map): Impassable, Travel Not Advised, Completely Covered, Partially
  Covered, Seasonal. Confirmed service is formally titled "Iowa 511
  Winter Road Conditions," active Oct 15-Apr 15 (today, Oct 11, is right
  at the edge of that window). Scoring uses the **string** field
  (`ROAD_CONDITION`) rather than the numeric code, since only
  `Seasonal=10` was ever confirmed live and the full code-to-string
  pairing wasn't independently verified — scoring off the string avoids
  guessing at the numeric mapping. Weight finalized at 0.4 in section 4's
  table (no longer "pending").
- **2026-10-11**: Resolved section 3's NWS scoring table. Found and used
  the official CAP (Common Alerting Protocol) enumeration definitions for
  severity/certainty/urgency (OASIS CAP v1.2 spec, mirrored on Google's
  public CAP requirements docs) rather than inventing a 4x4x4 lookup
  table by hand. Severity maps directly to a 1-4 base score (its CAP
  definitions are already a graded threat scale). Certainty's CAP
  definitions include actual probability bands (Likely = >50%, Possible
  = <=50%) which became a defensible multiplicative modifier (Observed
  1.0, Likely 0.85, Possible 0.5, Unlikely 0.1). Urgency's CAP definition
  is about timing of required action, not threat magnitude, so it does
  NOT rescale the score — it feeds the rationale/timing language instead,
  avoiding double-counting. Validated the formula against all 4 real
  NWS scenarios captured in `data/fixtures/` (Iowa flood -> 3.0, Montana
  winter storm -> 2.55, SC tornado (historical) -> 4.0, San Diego
  tropical storm watch -> 1.5) — results land in intuitively correct
  posture bands, including correctly placing a low-certainty "Watch" well
  below a "Warning" of the same severity label, which directly reflects
  the "upcoming but yet unknown" distinction raised earlier in scoping.
- **2026-10-11**: User supplied the ArcGIS Hub v3 datasets API
  (`opendata.arcgis.com/api/v3/datasets?filter[slug]=...`) as an
  alternative to the non-fetchable JS-rendered "about" page. Confirmed
  working and useful — includes field-level statistics. Found
  `previous_road_condition` distribution across current segments: 683
  "Partially Covered", 299 "Seasonal", 32 "Completely Covered" — NOT all
  baseline, contradicting the live check. **Re-verified live
  `ROAD_CONDITION` directly via the FeatureServer query again: still all
  1014 segments at "Seasonal" right now.** Conclusion: the Hub stats
  endpoint's `previous_road_condition` numbers reflect a recent-past
  snapshot (an actual winter event that has since cleared), not current
  live state — the two fields answer different questions
  ("what was it recently" vs "what is it now") and aren't contradictory
  once that's understood. Current live state for scoring purposes
  remains all-Seasonal/normal, consistent with earlier findings.
- **2026-10-11**: Resolved the urgency-scoring question from section 3 by
  reframing it as a presentation design, not a pure math one. Urgency is
  rendered as a plain-language qualifier displayed next to each source's
  score (e.g. "worth evaluating for the day... but not an IMMEDIATE"),
  not folded into the numeric score. This also resolved the
  earlier-deferred "how to prioritize findings for a facility manager"
  question: output is grouped by source tier (government/primary,
  supplemental, narrative-only — matching section 4's weighting model),
  sorted by score within tier, with urgency always shown as a qualifier
  string rather than used as a sort key. Section 5's output schema
  updated to a tiered `sources: {government, supplemental, narrative}`
  structure instead of a flat `inputs` list.
- **2026-10-11**: Decided message/rationale generation is templated, not
  LLM-generated — the combination space (severity tier x certainty tier x
  posture band x urgency qualifier) is small enough that templates give
  fully deterministic output with no new dependency, latency, or cost,
  and still satisfy the plain-language-paragraph deliverable. Simplifies
  section 6 (architecture) by removing any need for an LLM inference path.
- **2026-10-11**: Consistency pass across the whole doc before moving to
  section 6 (architecture). Fixed: section 2 and 4 open-question
  checkmarks that were resolved elsewhere but never checked off; section
  statuses for 3/4/5 bumped from DRAFT to REVIEWED (all have resolved
  designs with real validated numbers now); section 5's `rationale`
  placeholder text updated from "generated" to "templated" to match the
  templated-not-LLM decision; connected section 5's open notification
  question explicitly back to section 1's already-defined applicability
  rule (logic exists, just not wired into the output schema yet); flagged
  a known gap where section 4's custom-source extensibility pattern
  (KDKD) isn't yet reflected as a field on the facility schema in section
  1 — deliberately left unfixed rather than add an unbuilt-looking field.
- **2026-10-11**: Confirmed KDKD/custom-source wiring is a stretch
  delighter, explicitly sequenced *after* the core pipeline works, not a
  parallel task. Updated section 1's note accordingly.
- **2026-10-11**: Resolved section 6 (architecture). Checked user's real
  `~/workspace/ccnx-*` projects to confirm actual day-to-day stack
  (TypeScript/Node Lambda functions, Angular frontend, CDK infra) rather
  than guessing — reusing it directly for near-zero setup friction with
  ~7-8 hours remaining. Decision: local-first, production-shaped. Node/
  Express backend run locally (maps to API Gateway+Lambda in production
  with no logic changes), Angular frontend with codegen (maps to S3+
  CloudFront with no logic changes), synthetic data kept as JSON/YAML on
  disk but deliberately keyed like a DynamoDB single-table design
  (facilityId as partition key) so a later real-DynamoDB swap is a thin
  adapter change. CDK stack written to sketch the production shape but
  explicitly NOT deployed — demo risk (cold starts, auth hiccups) has no
  upside since code quality isn't judged. Confirmed UI delighters:
  reactive re-evaluation on employee location/status edits, and a
  multi-facility state/office picker explicitly scoped as "prove the
  oversight-role pattern and live per-location data pull," not "model
  all USDA facilities" — 5-6 seeded facilities across a few states, not
  comprehensive coverage. No authn/z, explicitly out of scope for the POC.
- **2026-10-11**: Flagged (per user request) that USGS gauge height has
  no native flood-stage field. Followed up by checking NWS's NWPS API
  docs (`water.noaa.gov/about/api`) and finding the correct gauge ID
  pattern -- NWPS uses short alphanumeric location IDs ("lid"), not
  USGS's numeric site IDs. Found the actual lid for our Clinton, IA site
  (`CMMI4` = "Mississippi River at Camanche") via web search, confirmed
  it maps to `usgsId: 05420500` -- **the exact same USGS site we're
  already using.** `GET api.water.noaa.gov/nwps/v1/gauges/cmmi4`
  (confirmed live, no key) returns:
  - An NWS-computed `status.observed.floodCategory` field (currently
    `"no_flooding"`) -- categorical, authoritative, directly scorable,
    no ratio math needed if we use this instead of/alongside the raw
    ratio approach.
  - The **actual official flood-stage thresholds** for this gauge:
    action=16ft, minor=17ft, moderate=18.5ft, major=20.5ft.
  - **This corrects a real error**: the "11.0 ft" flood stage used in
    `usgsScoring.ts` testing was pulled from the Flood Warning's free
    text, which references a *different* waterway ("Wapsipinicon River
    near De Witt"), not the Mississippi River gauge we're actually
    scoring. The correct action-stage threshold for this gauge is 16 ft,
    not 11 ft -- our test case (9.86 ft) is well below even the
    "action" threshold at this gauge, not sitting near a flood boundary
    as the earlier (wrong) reference implied.
  - Captured as `data/fixtures/nwps-gauge-cmmi4-clinton-ia.yaml`.
  - **Resolved**: USGS adapter will be updated to use this NWPS endpoint
    as the authoritative flood-stage source (option (b) from the earlier
    flagged list), rather than a hardcoded/caller-supplied guess. Thresholds
    sourced live from NWS, not fabricated.
- **2026-10-11**: Rewrote the USGS/river-gauge adapter to query NWS's
  NWPS API directly (`api.water.noaa.gov/nwps/v1/gauges/{lid}`) instead
  of raw USGS gauge height + a guessed flood-stage reference. NWPS
  returns the same underlying reading (confirmed `usgsId` field matches
  our original site 05420500) plus NWS's own computed `floodCategory`
  and the gauge's real official thresholds (action=16/minor=17/
  moderate=18.5/major=20.5 ft for this gauge). Added two scoring
  functions: `scoreByFloodCategory` (preferred, authoritative) and
  `scoreByThresholds` (fallback if category is missing but thresholds
  exist). Re-verified live: current reading (9.86 ft) now correctly
  scores 0/"no flooding" against the right thresholds, versus the
  earlier incorrect ~90%-of-wrong-river's-flood-stage result. Route
  signature changed from `siteId`+`floodStageFt` to `lid` (NWPS location
  ID) since NWPS supplies both the reading and thresholds in one call.
- **2026-10-11**: User found the real NWPS OpenAPI spec
  (`api.water.noaa.gov/nwps/v1/docs/swagger.json`), which I had not
  located during my earlier guessing. Confirmed it's the real spec and
  checked the `/gauges/{identifier}` path definition: the `identifier`
  param explicitly accepts **either** the NWPS lid (e.g. "CMMI4") **or**
  the raw USGS site number (e.g. "05420500") -- verified live, both
  resolve to the identical gauge. Updated the adapter and route
  (`/api/sources/usgs?identifier=`) to use this generic naming, since it
  means facility records only need to store the widely-known USGS site
  ID (the one actually named in the challenge text) and never need to
  separately look up an NWPS-specific lid. Captured a trimmed summary of
  the gauges-related paths from the real spec as
  `data/fixtures/nwps-swagger-summary.yaml`.
- **2026-10-11**: Added AQICN source adapter following the same hardened
  pattern (timeout, response-shape checks, graceful absent/
  insufficient_data handling). Confirmed the EPA 2016 AQI breakpoint
  scale directly from aqicn.org/scale/ (our actual provider, which
  explicitly implements this standard) and cross-checked against airnow.
  gov -- 6 EPA categories (Good/Moderate/USG/Unhealthy/Very Unhealthy/
  Hazardous) mapped onto the 0-4 posture scale, with Very Unhealthy and
  Hazardous both landing at 4 (defensible: both are already
  emergency-level in EPA's own language). Validated all boundary values
  plus the real Clinton, IA fixture (AQI 64 -> Moderate -> 1).
  Found and fixed two real bugs during live testing, not hypothetical:
  (1) `.env` lives at the project root, not inside `server/` -- dotenv's
  default lookup missed it entirely, token silently read as undefined.
  Fixed by loading `.env` with an explicit resolved path.
  (2) AQICN's nearest-station geo lookup has **no distance cutoff** --
  confirmed live that querying lat=0,lon=0 (middle of the ocean) still
  returned a real station answer, from South Africa, ~3974km away,
  rather than "no station nearby." Added a haversine distance check
  (reject matches beyond 100km) using the station's own returned
  coordinates, re-verified both the rejection case and that real
  Iowa/Montana facilities still score correctly.
- **2026-10-11**: Built the aggregation/repository layer and ran a real
  evaluation end-to-end for the first time (Iowa facility: live NWS
  Flood Warning + USGS/NWPS + AQICN + synthetic employee roster +
  schedule applicability). Immediately found the weighted-average
  formula produces a wrong result in practice: the live severe NWS
  Flood Warning (score 3.0) got diluted to 1.58 (Early Dismissal) by
  two unrelated "all clear" supplemental readings. Walked through
  tornado/upstream-flood/wildfire-smoke scenarios with the user and
  confirmed the root cause: averaging across unrelated hazard
  dimensions (wind/storm vs. flood vs. air quality) is categorically
  wrong, not a tuning problem -- we lack source-level hazard-dimension
  tagging needed to average correctly within a dimension vs. max
  across dimensions. Per user direction, simplified rather than guess:
  posture recommendation now driven by the highest-scoring government
  (NWS) source alone; supplemental sources shown in full but not
  blended into the number; old weighted average kept as
  `experimentalBlendedScore`, explicitly non-authoritative. Hazard-
  dimension-aware blending logged as a real TODO for later, not solved
  tonight. Verified live: Iowa facility now correctly recommends
  Telework/Unscheduled Leave (score 3.0) matching the actual severe
  flood warning, not diluted by the calm river gauge and clean air
  readings shown alongside it.
- **2026-10-11**: Built the full repository layer
  (`server/src/repository/`): facilities, employees, schedule entries,
  all file-backed from `data/synthetic/*.yaml`, DynamoDB-key-shaped per
  section 6. Implemented and verified the "who's applicable at a
  facility today" rule from section 1 exactly against the real
  synthetic data (Jordan/Pat included normally, Avery excluded
  on_detail, Morgan excluded telework, Taylor included via the
  in_office_today exception -- the specific case the data model
  redesign was built to handle, confirmed working end-to-end).
- **2026-10-11**: Scaffolded the Angular UI (`ui/`, Angular 19 CLI,
  standalone components, codegen-generated per section 6). Built:
  `FacilityPickerComponent` (state -> office picker, delighter #2),
  `FacilityDashboardComponent` (tiered source display, posture header,
  rationale, notification recipient table), `ApiService` (typed HTTP
  client against the real backend), and hand-written TypeScript models
  mirroring the backend's actual response shape (verified field-by-field
  against a live `/evaluate` call, not assumed). Found and fixed a real
  gap during verification: Express had no CORS headers, which curl
  doesn't enforce but a real browser would -- added `cors` middleware
  scoped to `http://localhost:4200`, confirmed `Access-Control-Allow-
  Origin` now present. Verified both `/api/facilities` and
  `/api/facilities/:id/evaluate` end-to-end against the running backend
  with the `Origin` header a browser would send. Production build
  (`ng build`) and dev server (`ng serve`) both confirmed working.
- **2026-10-11**: User caught a serious bug live, from a screenshot: a
  transient NWS 500 error produced a green "Normal Operations" banner
  instead of surfacing the failure, because `index.ts` treated "no
  government-tier score" as always meaning "legitimately nothing to
  report," without distinguishing that from "the primary source
  errored, we have no data at all." This directly violates the
  system's own "absence is not evidence of normalcy" principle (section
  2) in its most dangerous form -- not just omitting a null signal from
  math, but actively mislabeling a failure as a confirmed-clear state.
  **Fixed**: added a new `unknown` posture (distinct from `normal`),
  gray/neutral diagonal-stripe styling (deliberately not green or red,
  since it means "we don't know," not "it's fine" or "it's bad").
  `index.ts` now checks whether NWS specifically appears in
  `sourceErrors` and routes to `unknown` rather than `normal` in that
  case. Rationale template now has a dedicated error-case message
  telling the manager explicitly not to treat it as "all clear" and to
  verify manually. Moved the source-error banner to render above the
  posture header (previously below it, meaning the misleading green
  banner was the first thing visible) and restyled it as a prominent
  red-bordered warning box rather than plain red text. **Verified live
  by deliberately breaking the NWS adapter's base URL**, confirming the
  dashboard correctly showed "Status Unknown — Verify Manually" with
  the real fetch error surfaced, then reverted and confirmed normal
  operation resumed.
- **2026-10-11**: Full review against the original challenge text,
  requirement by requirement, at user's request. Found real gaps, not
  just polish items: (1) `accessibilityNotes` captured but never
  displayed. (2) No notification channel routing or drafted message
  content at all -- named explicitly as deliverable #3 and in the
  "right channel" notification requirement. (3) **Regression**:
  `thresholdCrossed`, `confidence`, and `whatWouldChange` were designed
  in section 5 but silently dropped when the aggregation logic was
  rewritten (max-of-government-tier fix) -- the response shape was
  rebuilt at that point and these three fields were never carried
  forward, not a conscious scope cut. (4) **Highest priority**: no
  decision record persistence exists at all -- every `/evaluate` call
  is stateless. The challenge explicitly names this "the deliverable
  most teams will skip," and we are currently in that group. Confirmed
  threshold defensibility (deliverable 5) remains strong and well-
  documented. Added section 7 as a formal, continuously-updated gap
  tracker (replacing the unused "Build Plan/Time Budget" placeholder)
  so these don't silently regress again. Verified live timestamp
  availability per source (NWS `sent`/`effective`/`onset`/`expires`,
  NWPS `validTime`, AQICN `time.iso`) ahead of building the decision
  record, per user's flag that the record needs to distinguish
  source-reported update time from our own evaluation time.
- **2026-10-11**: Made severity/certainty/urgency visually prominent on
  government-source cards (colored badges) instead of a muted caption
  line, per user request -- these are the explicitly-named basis of the
  NWS CAP scoring formula (section 3) and the challenge calls them out
  by name. Also added a human-readable "last updated" timestamp to
  every source card (government and supplemental).
- **2026-10-11**: User manual-testing pass surfaced four real issues.
  (1) **Decision record spam**: every dashboard page view/refresh calls
  `/evaluate`, which was persisting a new record every time -- found
  live with 8-9 near-identical records seconds apart during one viewing
  session, defeating the point of a trustworthy audit trail. Fixed with
  a dedup rule in `appendDecisionRecord`: skip persisting if the most
  recent record for the same facility has the same posture/score/
  governmentSourceErrored state AND was recorded within 5 minutes. A
  genuinely changed condition is never deduplicated regardless of
  timing. (2) **Decision log stale-state bug**: switching facilities
  didn't clear the previous facility's records/expanded-row state
  before the new fetch resolved -- fixed by explicitly resetting both
  on facility change. (3) **Misleading column label**: "Affected Today"
  on the roster table was confusing against a facility with zero active
  alerts (Montana's one employee showed "✓ Yes" with nothing to point
  to) -- the column actually means "would be notified/is in the
  applicable set," not "is currently affected by a hazard." Renamed to
  "Would Be Notified" to match what's actually computed. (4) **Single-
  facility-per-state**: added a second Iowa facility (Des Moines, USDA
  FSA Iowa State Office) and second Montana facility (Great Falls --
  one of the offices actively issuing Winter Storm Warnings during
  original data-source scoping, a thematically fitting choice), each
  with 2 seeded employees, so the state/office picker demonstrates real
  multi-facility browsing rather than one facility per state looking
  like a dead-end dropdown. Verified all four fixes live: dedup
  (3 identical calls -> 1 record), decision log clearing on facility
  switch, new facilities' real NWS/roster data, and the relabeled
  column.
- **2026-10-11**: User identified that the dedup-on-timing fix from the
  previous round was treating the wrong symptom. The real issue:
  viewing/refreshing the dashboard should never be conflated with
  making a decision at all, regardless of dedup windows. **Redesigned**:
  `GET /evaluate` is now purely read-only, persists nothing. Added
  `POST /api/facilities/:id/decisions` as the ONLY route that writes a
  decision record -- it re-runs a fresh evaluation at the moment of
  the explicit action (not reusing stale client state), and accepts an
  optional `decidedPosture` override plus `decidedBy`/`notes`. This
  directly implements the challenge's explicit framing ("the goal is
  not to automate the decision") as a real, auditable mechanic: the
  system recommends, a human can confirm or override, and the record
  captures `recommendedPosture` vs. the actually-`posture` decided plus
  a `wasOverridden` flag -- an override is a first-class case, not an
  edge case. Removed the now-unneeded dedup logic entirely (explicit
  actions never need deduplicating). Added a "Record This Decision" UI
  control (posture override dropdown, decided-by, notes, confirm
  button) to the dashboard. Verified live: plain GET /evaluate persists
  nothing (0 records), POST /decisions persists correctly including a
  deliberate-override test case (`wasOverridden: true`, both postures
  preserved).
- **2026-10-11**: User flagged that "no official government source
  available" needs the same visual prominence we already gave to the
  "source errored" case -- both are "important decision data are
  missing," just for different reasons (one's a system failure, one's
  a legitimate "checked, nothing active"). Added a distinct
  `noGovernmentDataAvailable` flag to the `/evaluate` response and a
  new amber/informational banner (deliberately different styling from
  the red error banner -- this isn't a failure) rendered above the
  posture header whenever it's true. Verified live: Des Moines (no
  active NWS alert right now) correctly flags true; Clinton (active
  flood warning) correctly flags false.
- **2026-10-11**: Fixed awkward roster label wording flagged by
  screenshot review -- "In office today (exception)" paired with a
  schedule note that already explains the exception read redundant.
  Simplified the label to "In office today," letting the note alone
  carry the "why."
