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
- [ ] Exact severity/certainty/urgency → score mapping table (section 3)
- [ ] Threshold defensibility citations: NWS alert taxonomy + OPM federal
      operating status categories

---

## 3. Individual Evaluation Outcomes

**Status: DRAFT**

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
- [ ] USGS gauge height ratio-to-flood-stage conversion still not
      finalized as an exact formula (flood stage value is known — 11.0 ft
      at the Clinton gauge, from the live warning text — but the
      ratio-to-score curve itself needs the same treatment this section
      just got for NWS)

---

## 4. Final Output Parameters & Weighted Sources

**Status: DRAFT**

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
- [ ] Confirm posture ladder bucket boundaries against sample scenarios
      once section 3 scoring table is finalized
- [ ] Define NHC → posture-pressure score mapping (intensity in kt →
      score, since NHC has no severity/certainty/urgency taxonomy to reuse)

---

## 5. Outcome / Recommendation Pattern

**Status: DRAFT**

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
  "rationale": "<generated one-paragraph text>",
  "notification": {
    "recipients": [],
    "message": "",
    "channels": {}
  },
  "decisionRecordId": "<uuid>",
  "recordedAt": "<timestamp>"
}
```

**Prioritization-for-presentation rule** (resolves the earlier-deferred
question): sort by tier (government > supplemental > narrative), then by
score descending within tier. Urgency is always rendered as a qualifier
string under the relevant entry, never used as a sort key or folded into
the numeric score — keeps the formula in section 3 simple/auditable while
still surfacing timing information where a human needs it most: right
next to the thing it qualifies.

### Open Questions
- [ ] Notification recipient logic details (who's excluded/included and
      why) — ties to section 1's "who's applicable at a facility today"
      rule, not yet connected to this output structure
- [ ] Message drafting approach — templated vs generated text per posture.
      The `urgencyNote`/rationale strings above could be templated
      (fast, no dependency) or LLM-generated (more natural, adds a
      dependency) — needs a decision before section 6 (architecture)

---

## 6. Architecture (not yet started)

**Status: NOT STARTED** — deferred until sections 1-5 reviewed

---

## 7. Build Plan / Time Budget (not yet started)

**Status: NOT STARTED**

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
