# Demo Script — USDA Weather-Driven Facility Decisions

3-minute live pitch, no slides. Order below maps directly onto the 5
deliverables so nothing gets missed under time pressure.

## Setup (before judges arrive)
- `cd server && npm run dev` (port 3001)
- `cd ui && npx ng serve` (port 4200)
- Open `http://localhost:4200`, pick **Clinton, IA** first (most
  stable/verified scenario — live Flood Warning)
- Have a second tab ready on **Great Falls, MT** (Winter Storm Warning
  — proves it's not hardcoded to one hazard type)
- Check `data/decision-records/` and `data/notification-log/` — clear
  test-pollution records if any exist (`rm -f data/decision-records/records.jsonl data/notification-log/notifications.jsonl`)

## The pitch (talking points, ~30 sec)
"When severe weather threatens a USDA facility, a manager needs three
things fast: what's actually happening, who's affected, and a record
of why they decided what they decided. This pulls live NWS data —
real alerts, right now, somewhere in the country — plus river gauge,
air quality, and state DOT road data, and turns it into one graded
recommendation a human can act on in seconds."

## Walkthrough (deliverable-by-deliverable, ~2 min)

**1. Live data, not mocked** — Point at the Clinton page. "This Flood
Warning is live from api.weather.gov right now." Switch to Great
Falls. "Different facility, different state, different hazard —
same pipeline, zero code changes."

**2. Recommendation with reasoning** — Point at the posture badge +
rationale. Call out by name: "posture, every input with source and
timestamp, which threshold was crossed, confidence, what would change
it, and a plain-language paragraph a manager could paste into an
email." (All five sub-items are literally visible on screen at once —
worth saying each one out loud since it maps word-for-word to the
deliverable text.)

**3. Notification package** — Scroll to "Who Would Be Notified." Point
out: the roster vs. who's actually applicable today (someone on
detail elsewhere, someone normally remote but in-office today for a
specific reason). Expand the drafted-message preview — show the
essential-personnel line is separate and unconditional. Click
**Notify** on one row — "that's logged immediately below."

**4. The decision record** — Scroll to Decision Record History. "This
is the one most teams skip." Click **Record Decision**, submit it,
show it appear with: what was recommended vs. what was actually
decided, every input's own timestamp distinct from when the decision
was made, and whether it was an override.

**5. Threshold defensibility** — Open one NWS card's severity/
certainty/urgency badges. "These three fields come straight from the
CAP alert spec — same taxonomy phones use for emergency alerts. Our
score is severity × certainty, officially defined bands, not a
guessed number." Mention Iowa DOT's legend and USGS's own flood
category as the same pattern for the supplemental sources.

## If asked "does this scale / is this just these two facilities"
Switch to San Diego or Pendleton live. "These two were added in the
last hour by editing a data file — no code touched — and both
evaluated correctly against live alerts on the first try, including
one with 9 simultaneous active warnings in one zone." This is the
strongest "this isn't a demo-rigged toy" moment available — use it if
there's any skepticism about hardcoding.

## If asked about production/AWS
"Everything here is already shaped for a real deployment — the
backend's an Express app that drops into Lambda behind API Gateway
unchanged, the data layer is already keyed like a DynamoDB table
(facilityId as partition key), and the Angular build is already static
files for S3+CloudFront. We verified real AWS access this session and
could deploy this, we chose not to for the pitch itself — zero
cold-start/network risk during a timed demo, with no judging upside
since code quality isn't scored." (See `docs/project-scope.md` section
6 for the full table if asked for specifics.)

## Known gaps, if asked directly (don't volunteer, answer honestly if asked)
- No real email/SMS dispatch yet — notifications are drafted, channel-
  routed, and fully logged, but sending is simulated-and-recorded, not
  wired to SNS/SES yet.
- Essential personnel who are on approved leave/detail elsewhere today
  still get notified with no distinction from "essential and expected
  to report" — a known, documented limitation, not something we tried
  to hide.
- No auth — explicit scope cut for a local demo; a real deployment
  needs Cognito/IAM in front of it.

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

## Quick recovery lines if live data is uncooperative during the pitch
- If Clinton's flood has cleared: check Great Falls or pull up
  `curl https://api.weather.gov/alerts/active | ...` quickly to find
  whatever's active nationwide right now and switch to a facility near
  it live — this is itself a good demo moment ("there's always
  something active somewhere, let's find it right now").
- If a source times out: the red "data source failure" banner and
  Status Unknown posture are themselves a feature to point at — "we
  don't silently show green when we can't actually confirm it."
