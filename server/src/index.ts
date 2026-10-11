import path from "node:path";
import dotenv from "dotenv";
import express, { type Request, type Response } from "express";

// .env lives at the project root (2026-hack-midwest/.env), not inside
// server/ -- shared across server/cdk/ui per docs/project-scope.md's
// Credentials & Secrets section. Loaded explicitly rather than relying
// on dotenv's default cwd-relative lookup.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
import { evaluateNwsAlerts } from "./sources/nws";
import { evaluateUsgsGaugeHeight } from "./sources/usgs";
import { evaluateAqicn } from "./sources/aqicn";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

/**
 * First real integration slice: hit the live NWS pipeline for an
 * arbitrary lat/lon and return the scored outcomes.
 *
 * Example: GET /api/sources/nws?lat=41.8847&lon=-90.1943  (Clinton, IA)
 */
app.get("/api/sources/nws", async (req: Request, res: Response) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    res.status(400).json({ error: "lat and lon query params are required numbers" });
    return;
  }

  try {
    const outcomes = await evaluateNwsAlerts(lat, lon);
    res.json({ lat, lon, outcomes });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "NWS lookup failed", detail: message });
  }
});

/**
 * Second integration slice: live river gauge data via NOAA's NWPS API.
 *
 * Accepts either a USGS site number or an NWPS location ID -- confirmed
 * live via NWPS's own swagger spec and a direct test that both resolve
 * to the same gauge.
 *
 * Examples:
 *   GET /api/sources/usgs?identifier=05420500  (USGS site number)
 *   GET /api/sources/usgs?identifier=CMMI4     (NWPS location ID)
 */
app.get("/api/sources/usgs", async (req: Request, res: Response) => {
  const identifier = typeof req.query.identifier === "string" ? req.query.identifier : undefined;

  if (!identifier) {
    res.status(400).json({ error: "identifier query param is required (USGS site number or NWPS lid)" });
    return;
  }

  try {
    const outcome = await evaluateUsgsGaugeHeight(identifier);
    res.json({ identifier, outcome });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "River gauge lookup failed", detail: message });
  }
});

/**
 * Third integration slice: live AQI via AQICN.
 *
 * Example: GET /api/sources/aqicn?lat=41.8847&lon=-90.1943 (Clinton, IA)
 */
app.get("/api/sources/aqicn", async (req: Request, res: Response) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    res.status(400).json({ error: "lat and lon query params are required numbers" });
    return;
  }

  try {
    const outcome = await evaluateAqicn(lat, lon);
    res.json({ lat, lon, outcome });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "AQICN lookup failed", detail: message });
  }
});

app.listen(PORT, () => {
  console.log(`USDA facility decisions server listening on http://localhost:${PORT}`);
});
