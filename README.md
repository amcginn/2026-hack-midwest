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

## Two builds of this app exist

**1. Client/server (full-featured)** — the primary build, described
in "Quick start" below. An Express backend talks to all four live data
sources (including AQICN, which needs an API token kept server-side)
and persists decision records/notification logs/facility links to
files on disk. Run locally; not currently deployed anywhere public.

**2. Standalone (self-contained, no backend)** — a parallel build
that calls NWS, USGS/NOAA river gauges, and Iowa DOT directly from the
browser, with no server at all. Deployed to GitHub Pages:

**https://amcginn.github.io/2026-hack-midwest/**

This build intentionally does **not** include AQICN — its API token
can't ship in client-side JavaScript without being readable by anyone
who opens dev tools, so the credential stays server-side only. The
AQICN card still appears on the dashboard, explaining that this is a
real feature of the full build, just not wired up here (not an error
or a missing-config state). Decision records, the notification log,
and facility links persist to the browser's `localStorage` instead of
server-side files, so they survive across sessions on the same
browser but aren't shared across devices.

Source for the standalone build lives under `ui/src/app/standalone/`
(ported, not shared, from the server's evaluator/scoring/data-access
logic — see that directory's module comments) and
`ui/src/app/services/standalone-api.service.ts`. It's built via a
separate Angular build configuration (`ng build --configuration
standalone`) and deployed automatically on push to `main` by
`.github/workflows/deploy-standalone.yml`.

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
  src/app/standalone/   Self-contained (no-backend) port, used only by
                         the `standalone` build config -- see "Two
                         builds of this app exist" above.
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

| Source | Needs a key? | Scope | In standalone build? |
|---|---|---|---|
| National Weather Service (NWS) | No | Every facility | Yes |
| USGS / NOAA river gauges (via NWPS) | No | Facilities near a monitored river | Yes |
| AQICN air quality | Yes (free, see above) | Facilities within range of a monitoring station | No — see "Two builds" above |
| Iowa DOT road conditions | No | Iowa facilities only | Yes |
