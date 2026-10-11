# Demo Script — FacMan (USDA Weather-Driven Facility Decisions)

**You have ~30 minutes until submission is due. Demo must be under 3
minutes.** Don't touch code again — present with what's already built
and verified. "FacMan" is a verbal/branding name only, not in the app
itself (app title stays "USDA Weather-Driven Facility Decisions").

## Do this first, right now (2 min)
- Confirm both servers are running: `curl http://localhost:3001/health`
  and the UI tab is open at `http://localhost:4200`
- Load Clinton, IA. If its Flood Warning has cleared, load Great Falls,
  MT instead. If both are clear, check whichever facility currently has
  something active -- don't spend time investigating, just pick one.
- That's it. Don't refactor, don't restyle, don't "just fix one more
  thing." Record now.

## 3-minute script

**[0:00–0:20] Open on the root page.** "This is FacMan — it ingests
live weather and operational data, scores it against official
thresholds, and gives a facility manager one graded recommendation,
a drafted notification, and a permanent decision record."

**[0:20–1:10] Pick Clinton, IA (or whichever has live data).** Point at:
- Posture badge + rationale: "Telework/Unscheduled Leave, driven by a
  live Flood Warning from the National Weather Service right now."
- The three explanation rows: "threshold crossed, confidence, what
  would change it — plus the plain-language rationale."
- One NWS card's severity/certainty/urgency badges: "these come
  straight from the official CAP alert spec, not a guessed number."

**[1:10–1:50] Scroll to notification + decision record.**
- "Who Would Be Notified" — point out someone excluded (on detail
  elsewhere) and someone included despite normally being remote.
- Expand the drafted message preview — "channel-routed, and essential
  personnel get a separate, unconditional line."
- Scroll to Decision Record History — "full audit trail: what was
  recommended, what was actually decided, every input's own timestamp."

**[1:50–2:30] Switch to a second facility (Great Falls, San Diego, or
Pendleton).** "Different state, different hazard, zero code changes —
this one was added live during the build with no code touched at all,
and it worked against live alerts on the first try."

**[2:30–3:00] Close.** "Everything here is already shaped to deploy
directly to AWS — Express maps to Lambda, the data layer's already
keyed like DynamoDB, confirmed with real AWS access this session. We
ran it locally for the demo on purpose — zero cold-start risk, no
judging upside either way since code quality isn't scored."

## If a question comes up (keep answers to one sentence)
- **"Does this scale?"** → "Added two new facilities in new states
  this session with zero code changes — just data."
- **"Why local, not deployed?"** → the closing line above covers it.
- **"Real notifications?"** → "Drafted, channel-routed, and logged —
  simulated send for the demo, SNS/SES is the next step."
- **"Essential staff on leave?"** → "Known limitation — they're still
  notified today with no distinction, documented, not hidden."

## Don't do right now
- Don't rename anything in the app.
- Don't restyle anything.
- Don't clear the decision/notification logs unless it's a 10-second
  `rm` you're confident won't break anything — not worth the risk this
  close to the deadline.
