# FacMan — USDA Weather-Driven Facility Decisions

A facility-manager tool that ingests live NWS weather alerts (plus
river gauge, air quality, and state DOT road-condition data), scores
them against officially-sourced thresholds, and produces a graded
recommendation, a drafted notification package, and a permanent
decision record. Built for Hack Midwest 2026's "Closure Call:
Weather-Driven Facility Decisions and Notification" challenge.

See `docs/project-scope.md` for the full design history/decision log,
`docs/demo-script.md` for a pitch walkthrough, and `docs/roadmap.md`
for future-enhancement ideas.

## Quick start

Two things to run, in two separate terminals, from the project root.

### 1. Set up the AQICN token (optional, but recommended)

```bash
cp .env.example .env
```

Edit `.env` and fill in `AQICN_API_TOKEN` with a free token from
https://aqicn.org/data-platform/token/ (instant, no approval wait).

**You can skip this and the app still runs fine** — NWS, the USGS
river gauge, and Iowa DOT road conditions all work with no key at all.
Only the AQICN air-quality card will show "not configured" instead of
a real reading until this is set.

### 2. Start the backend

```bash
cd server
npm install
npm run dev
```

Listens on `http://localhost:3001`. Confirm it's up:
```bash
curl http://localhost:3001/health
# {"status":"ok"}
```

### 3. Start the frontend (new terminal, from project root)

```bash
cd ui
npm install
npx ng serve
```

Open `http://localhost:4200`.

That's it — pick a state and office, see live data.

## Known setup gotchas

- **Both servers must be running** for the UI to show real data — the
  Angular app calls `http://localhost:3001` directly (see
  `ui/src/app/services/api.service.ts`), there's no proxy/mock mode.
- **The backend caches synthetic facility/employee/schedule data in
  memory at startup.** If you edit any file under `data/synthetic/`
  while the server is running, you need to fully stop and restart it
  (`Ctrl+C`, then `npm run dev` again) — a hot-reload-looking restart
  from `tsx watch` does not reliably pick up changes to files other
  than `src/index.ts` itself. If data looks stale after an edit, this
  is almost always why.
- **No database** — facility/employee/schedule data is YAML under
  `data/synthetic/`. Decision records, the notification send log, and
  per-facility custom links are all real runtime data too, but
  file-backed (JSONL/JSON under `data/decision-records/`,
  `data/notification-log/`, `data/facility-links/` respectively) --
  all three directories are gitignored and will be empty/absent on a
  fresh clone, which is correct (they're generated at runtime, not
  shipped).
- **No auth.** This is a local/demo build by design — there is no
  login, and CORS is wide open. Do not expose this beyond localhost
  without adding authentication first (see `docs/project-scope.md`
  section 6 for the production-deployment plan, which does address
  this).

## Project layout

```
server/        Express API (TypeScript). npm run dev to run locally.
ui/            Angular app. npx ng serve to run locally.
data/
  synthetic/   Hand-authored facility/employee/schedule seed data (YAML).
  fixtures/    Captured sample API responses from early data-source scoping.
  decision-records/     Runtime-generated, gitignored.
  notification-log/     Runtime-generated, gitignored.
  facility-links/       Runtime-generated, gitignored.
docs/
  project-scope.md   Full design history, decision log, gap tracker.
  demo-script.md     Pitch walkthrough and facility cheat sheet.
  roadmap.md         Future-enhancement ideas, grouped by effort.
```

## Live data sources (no mocking)

| Source | Needs a key? | Scope |
|---|---|---|
| National Weather Service (NWS) | No | Every facility |
| USGS / NOAA river gauges (via NWPS) | No | Facilities near a monitored river |
| AQICN air quality | Yes (free, see above) | Facilities within range of a monitoring station |
| Iowa DOT road conditions | No | Iowa facilities only |
