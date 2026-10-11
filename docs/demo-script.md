# Submission Script — FacMan (USDA Weather-Driven Facility Decisions)

**Format**: 30-minute written/recorded submission (short recorded demo
embedded in it), submitted ahead of live demos later the same morning.
"FacMan" is the product/branding name used verbally and in the written
submission only — it is NOT wired into the app itself (the app's own
title stays the literal challenge framing, "USDA Weather-Driven
Facility Decisions"). Keep that distinction consistent across both the
written submission and the live demo later.

## Setup (before recording)
- `cd server && npm run dev` (port 3001)
- `cd ui && npx ng serve` (port 4200)
- Open `http://localhost:4200` at the root/overview page first (new
  as of this session) — shows the app description and the data-source
  list before any facility is picked
- Pick **Clinton, IA** first (most stable/verified scenario — live
  Flood Warning)
- Have **Great Falls, MT** ready as the second stop (Winter Storm
  Warning — proves it's not hardcoded to one hazard type)
- Decide now whether to clear `data/decision-records/records.jsonl`
  and `data/notification-log/notifications.jsonl` before recording --
  they currently contain real test data from this build session. Not
  required, but cleaner for a recording meant to represent the product.

## Written submission structure (30 min total — plenty of room)

### 1. Problem framing (~2 min)
Lead with the challenge's own framing, since judges will be scoring
against it directly: facility managers today check a forecast, maybe
a road map, maybe a school closure page, and make a 4am call with no
consistent record of why. The notification problem compounds it --
the building roster and the "who's actually affected today" list are
rarely the same list.

### 2. What FacMan does (~2 min)
One sentence: ingests live NWS alerts plus river, air-quality, and
state DOT data, scores them against officially-sourced thresholds,
and produces one graded recommendation, a drafted notification package,
and a permanent decision record — for a human to act on, not to
replace the human's judgment.

Explicitly state the generalization point here, since it's a genuine
differentiator: the pipeline isn't weather-specific. Weather is the
primary signal because the challenge named NWS as the core source, but
the facility model, scoring pipeline, and notification/audit layers are
built to take on any operational signal a manager would check -- adding
a new state's road-condition feed took one new file and zero changes
to the evaluation logic (demonstrated live this build session with
Iowa DOT).

### 3. Recorded demo (~5-8 min of actual recording, keep it tight)
Walk the deliverables in this order, using Clinton then Great Falls:

1. **Live data** — show the Flood Warning is a real, current NWS
   alert (point at the timestamp/offset). Switch to Great Falls --
   different hazard, different state, same pipeline.
2. **Recommendation with reasoning** — posture badge, rationale
   paragraph, and the three explanation rows (why this level / how
   sure / what to watch for) all visible together. Say each deliverable
   sub-item out loud once since the mapping is literal.
3. **Notification package** — scroll to "Who Would Be Notified."
   Show the roster-vs-applicable-today distinction (someone on detail
   elsewhere excluded, someone normally remote but in-office today
   included). Expand the drafted message preview, point out the
   essential-personnel line is separate and unconditional. Click
   Notify on one row, show it land in the log.
4. **Decision record** — Record a decision, show the history entry:
   recommended vs. actually decided, override flag, per-input
   timestamps distinct from the decision timestamp.
5. **Threshold defensibility** — open an NWS card's severity/
   certainty/urgency badges, name the CAP spec as the source. Mention
   Iowa DOT's own published legend and USGS's own flood category as
   the same defensibility pattern for the supplemental sources.
6. **Generalization proof** — switch to San Diego or Pendleton: "added
   in the last hour of this build by editing a data file, zero code
   touched, worked against live alerts on the first try."

### 4. Architecture / "why is this only local" (~3-4 min — include this
proactively in the written submission, don't wait to be asked)

This is worth stating up front rather than defensively, since a judge
skimming a local-only demo could reasonably wonder if that reflects a
limitation rather than a choice:

> "This runs locally for the demo by deliberate choice, not because it
> can't be hosted. Every piece is already shaped for a direct AWS
> deployment with no redesign:
> - The backend is a plain Express app -- drops into Lambda behind API
>   Gateway via `serverless-express` with no handler rewrites.
> - The data layer is already keyed exactly like a DynamoDB single-
>   table design (facilityId as the partition key) -- confirmed this
>   session when two brand-new facilities in new states were added
>   with zero code changes, only data.
> - The Angular build is already static files -- S3 + CloudFront, no
>   application changes.
> - We confirmed real, working AWS credentials for a provided workshop
>   account this session (`aws sts get-caller-identity` succeeded with
>   admin access) -- a real deployment is genuinely available, not
>   theoretical.
>
> We chose not to deploy for the pitch itself because a timed live demo
> has real cold-start and network risk with zero judging upside, since
> code quality isn't part of the scoring criteria -- that risk only
> matters during a live demo, not in a recorded walkthrough or in this
> written submission. The full migration plan, mapped piece-by-piece,
> is documented in the project's `docs/project-scope.md` (section 6) if
> judges want the specifics."

Full reference table (pull from `project-scope.md` section 6 if you
want to paste the actual table into the submission): Express->Lambda+
API Gateway, repository layer->DynamoDB, decision/notification logs->
DynamoDB tables, facility-links->DynamoDB item, Angular build->S3+
CloudFront, `.env` token->Secrets Manager, localhost URLs->real domain
names. Suggested order: DynamoDB tables first (zero risk, parallel to
the still-working local version), then Lambda+API Gateway, then S3+
CloudFront, then real SNS/SES dispatch last (the one genuinely new
capability, not just a deploy-target swap).

### 5. Known limitations (~1-2 min — state proactively, don't bury)
- No real email/SMS dispatch yet -- notifications are drafted,
  channel-routed, and fully logged, but sending is simulated/recorded,
  not wired to SNS/SES. Documented as the natural next deployment step.
- Essential personnel on approved leave/detail elsewhere today still
  get notified with no distinction from "essential and expected to
  report" -- a known, honest limitation, not hidden.
- No auth -- explicit scope cut for a local demo; a real deployment
  needs Cognito/IAM in front of it before public exposure.

### 6. Close (~1 min)
Restate the two things most teams skip per the challenge's own text:
the decision record (full before/after/override audit trail) and
threshold defensibility (every number traces to an official source --
CAP spec, EPA AQI breakpoints, state DOT's own published legend, NWS's
own flood category). Both are fully built, not placeholders.

## Facility cheat sheet (what each one proves)

| Facility | State | Hazard | What it demonstrates |
|---|---|---|---|
| Clinton | IA | Flood Warning | Primary/most-tested scenario. Full roster incl. on-detail/telework/in-office-exception employees. USGS + AQICN + Iowa DOT all attached. |
| Des Moines | IA | (usually clear) | "Checked and nothing active" vs. error state — amber vs red distinction. |
| Great Falls | MT | Winter Storm Warning | Proves generalization across hazard type/region. Multi-zone NWS record merge visible. |
| Billings | MT | (varies) | Backup MT facility. |
| San Diego | CA | Flash Flood Warning | Added live this session — zero-code-change proof. Multi-alert zone (9 concurrent) handled correctly. |
| Pendleton | OR | Freeze Warning | Added live this session — third distinct hazard type, zero code changes. |
| Alabama | AL | — | Zero employees seeded on purpose — proves empty-roster UI doesn't break. |

## For the LIVE demo later this morning (separate from this written
## submission — same product, shorter window)
Expect ~3 minutes including questions. Compress to: live data +
recommendation (Clinton), one quick scroll through notification +
decision record, and the San Diego/Pendleton generalization line if
asked "is this just hardcoded." Keep the architecture explanation to
one sentence unless directly asked -- the written submission already
covers it in depth, the live slot doesn't have time for the full
version.

## Quick recovery lines if live data is uncooperative
- If Clinton's flood has cleared by then: switch to whichever facility
  currently has something active, or check
  `curl https://api.weather.gov/alerts/active` quickly to find
  something nationwide and point the picker there live -- itself a
  good demo moment ("there's always something active somewhere").
- If a source times out: the red "data source failure" banner and
  Status Unknown posture are themselves a feature to point at -- "we
  don't silently show green when we can't actually confirm it."
