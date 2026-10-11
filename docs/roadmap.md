# Future Enhancements Roadmap

Captured 2026-10-11, post-submission, for reference if this project is
picked back up or shared. Items are grouped by effort, not priority --
read the "why" on each before assuming order.

AWS hosting is kept OUT of the live app for now (deliberate choice,
see `project-scope.md` section 6's "AWS Migration Plan" for the full
mapping table and the real test results from this session), but the
exact deployment plan is already known and documented there, so this
doc doesn't repeat it beyond the summary below.

---

## Moderate effort

### DynamoDB-backed repository layer
Replace the file-backed repository (`repository/facilities.ts`,
`employees.ts`, `schedule.ts`, `decisionRecord.ts`,
`notificationLog.ts`, `facilityLinks.ts`) with real DynamoDB calls.
Already keyed correctly for this (`facilityId` as partition key,
confirmed when two new facilities were added this session with zero
code changes). This is the actual blocker for persistence in Lambda --
Lambda's filesystem is ephemeral outside `/tmp`, so today's
file-backed writes (decision records, notification log, facility
links) would silently stop surviving between invocations if deployed
as-is. Needed before any real Lambda deployment handles writes, not
just reads.

### Browser-to-Lambda auth path
Confirmed this session: a public, unauthenticated Lambda Function URL
or API Gateway integration is blocked by this specific AWS account's
org-level policy (see project-scope.md for the 3-test proof). A direct
SigV4-signed request works fine. For a browser-based UI to call a
deployed API directly without that restriction (or in any account that
enforces similar guardrails), the standard pattern is a **Cognito
Identity Pool** handing the browser short-lived, signable AWS
credentials -- no login required if using an unauthenticated identity
pool role, just enough to let the browser's JS SDK sign requests.
Alternative, lower-setup option: a thin signing proxy (a small Lambda
or EC2 process that holds real credentials and forwards/signs
requests on the browser's behalf) -- more moving parts than Identity
Pools but no Cognito concepts to learn if that's unfamiliar.

### Expand road-condition coverage beyond Iowa
Iowa DOT's `511_IA_Road_Conditions_View` (confirmed live, built this
session) is one instance of the CARS511 platform. Minnesota's
`CARS511_MN_Events_View` was confirmed live during original data-source
scoping but never wired up (its live data was construction/maintenance
only at the time, not weather-driven). The same adapter pattern
(`sources/iowaDot.ts` + `evaluator/iowaDotScoring.ts`) generalizes
directly -- the main unknown per new state is whether that state's
CARS511 instance uses the same field names/legend, which would need
confirming live before trusting it.

### Config UI for supplemental-source applicability
Today, which supplemental sources apply to which facility is
code-level logic (`isApplicable()` on each `SupplementalAdapter` --
e.g. USGS checks `riverGaugeId` is set, Iowa DOT checks
`address.state === "IA"`). A real config UI would let someone view/
toggle this per facility without touching code -- useful once there
are more than a handful of sources and facilities. Would need a
small schema addition (e.g. a `sourceOverrides` field per facility)
and a dedicated admin view, similar in shape to the facility-links
edit page already built.

### Reactive re-evaluation UI
Originally scoped as a "delighter" (see project-scope.md section 6),
never built. The idea: a page to edit an employee's schedule-entry
status (on_detail/telework/leave/in_office_today) and immediately see
the notification recipient list update live, without needing to edit
the YAML file and restart the server. Directly demonstrates the "the
employee roster and the building roster are frequently not the same
list" framing interactively instead of only in a static example.

### "Decision already made today" lock (new idea, 2026-10-11)
**The problem**: nothing currently prevents two different facility
managers from independently recording two different decisions for the
same facility on the same day, off the same underlying data --
exactly the "two facility managers facing identical conditions can
reach different decisions" consistency problem the challenge calls
out, except our own tool doesn't yet prevent the SAME tool from being
used twice for the same day by different people.

**Proposed shape**: when loading a facility for a given date, check
whether a decision record already exists for that `facilityId` +
`requestedDate`. If one exists:
- Show it prominently at the top of the page ("A decision has already
  been made for today: [posture], by [decidedBy] at [time]") instead
  of (or alongside) the live recommendation.
- The live recommendation/rationale/explanation should STILL update
  throughout the day as conditions change -- per user: "advice could
  be updated throughout the day" -- this is explicitly NOT a hard
  lock on viewing fresh data, only on treating a NEW decision as
  needed when one already exists.
- Recording a SECOND decision for the same day should still be
  possible (conditions can genuinely change enough to warrant
  revisiting), but should require an explicit "override/revise
  today's decision" action distinct from the normal "Record Decision"
  flow -- so it's clear in the audit trail that this was a deliberate
  revision, not two people unknowingly stepping on each other.
- The decision record schema already has everything needed to detect
  this (`facilityId` + `requestedDate` are both already stored) --
  this is primarily a new read (does a record already exist for
  today) plus UI/copy changes, not a new data model.

---

## Larger effort

### Full AWS production deployment
DynamoDB + Lambda + API Gateway + S3/CloudFront + SNS/SES, in an
account without the public-access restriction found this session.
Already fully mapped piece-by-piece in `project-scope.md` section 6 --
summary: Express app already splits cleanly for Lambda (`app.ts` +
`lambda.ts`, built and verified working this session via direct
invoke), Angular build is already static files for S3+CloudFront, the
repository layer just needs the DynamoDB swap above. Suggested order:
DynamoDB tables first (zero risk, parallel to local), then Lambda+API
Gateway, then S3+CloudFront, then SNS/SES last.

### Real email/SMS dispatch (SNS/SES)
See the dedicated section below -- substantial enough to walk through
on its own.

### Authentication/authorization
No auth exists today (explicit scope decision, not an oversight). A
real deployment needs this before any exposure beyond a local demo --
likely Cognito User Pools for real user login (facility managers,
oversight roles) gating access to the API, possibly combined with the
Identity Pool approach above if the same Cognito setup also needs to
hand out signable credentials for direct Lambda calls.

### Hazard-dimension-aware aggregation
Today's scoring takes the MAX across all scored government-tier
sources (deliberate simplification -- see `evaluator/aggregate.ts`
module doc for the full history: an earlier weighted-average approach
was found to be wrong because it diluted a severe signal with
unrelated calm readings across different hazard types). The max-only
approach is correct for "don't dilute," but doesn't correctly ESCALATE
when two independently severe alerts are active at once (confirmed
live this session: San Diego had 9 simultaneous alerts, correctly
picked the top one, but two genuinely severe concurrent alerts don't
currently score higher than either alone). A real fix needs each
source tagged with a hazard dimension (wind/storm, flood, air quality,
etc.), blending only within a dimension, and taking the max ACROSS
dimensions with some escalation logic for genuine multi-hazard
corroboration. This needs real design time, not a quick patch -- flagged
as a design question in the aggregate.ts module doc already.

### Generalize beyond weather as the primary framing
The UI copy and architecture already gesture at this ("built to
evaluate any operational signal relevant to a facility, not only
weather"), but it's not yet a formalized extensibility story. A real
version of this would mean a documented `SupplementalAdapter`-style
contract usable by someone who isn't us, example adapters beyond the
weather-adjacent ones already built (e.g. power outage reporting,
school/government closure feeds -- both named in the original
challenge text as supplementary signal ideas, never built), and
probably a public-facing explanation of what counts as a valid new
source (does it need a numeric score? can it be narrative-only like
GA 511/KDKD were scoped as?).

---

## SNS/SES notification dispatch (detailed)

Currently: `POST /api/facilities/:facilityId/notifications` drafts a
message, picks a channel, and logs the send -- no real message is
transmitted. This is the natural next step once hosting exists for
real (SNS/SES calls work fine locally too, actually -- they don't
require Lambda, just AWS credentials and the right IAM permissions,
so this COULD be wired up even in the current local-only setup if
desired, independent of any AWS hosting decision).

**SES (email)**:
- Requires a verified sending identity (a verified email address or
  domain) before it can send to arbitrary recipients -- in SES
  "sandbox" mode (the default for a new/unverified account), you can
  ONLY send to other verified addresses, not arbitrary ones, until
  you request production access. Worth checking this account's SES
  sending status before assuming it "just works."
- API call is a simple `SendEmail` (or `SendRawEmail` for more control
  over formatting) -- the existing `longFormMessage` text per
  recipient maps directly to the email body.
- Would replace the "logged only" `messageText` field's role --
  instead of just recording what WOULD be sent, actually call SES and
  record the real send result (message ID, any bounce/complaint
  webhook data if wired up later) alongside the existing log entry.

**SNS (SMS)**:
- `Publish` with a `PhoneNumber` parameter sends directly to a number,
  no topic/subscription needed for this use case (topics are for
  broadcast to multiple subscribers; direct-to-number publish is
  simpler and matches our per-recipient model).
- Real cost per SMS (unlike SES, which has a meaningful free tier) --
  worth setting a spending limit/budget alert before wiring this up
  for real, especially during testing.
- Requires `shortFormMessage` to exist for the given posture (already
  built -- `null` for "normal," since there's no urgent action to
  compress into a text) -- the UI already disables the SMS option
  when there's no short-form message, so this constraint is already
  respected on the frontend.

**Suggested approach if picked up**: add a feature flag/environment
variable (e.g. `NOTIFICATIONS_DISPATCH_MODE=logged|real`) rather than
ripping out the logged-only behavior entirely -- keeps the safe,
free, demo-friendly default while making real dispatch an opt-in for
whoever's running it, including a future production deployment that
might want it off by default in a staging environment too.
