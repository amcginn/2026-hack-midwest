import "dotenv/config";
import express, { type Request, type Response } from "express";
import { evaluateNwsAlerts } from "./sources/nws";
import { evaluateUsgsGaugeHeight } from "./sources/usgs";

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
 * Second integration slice: live USGS gauge height.
 *
 * Example: GET /api/sources/usgs?siteId=05420500&floodStageFt=11.0
 * (Mississippi River at Clinton, IA; flood stage per the live NWS
 * Flood Warning text captured during scoping)
 */
app.get("/api/sources/usgs", async (req: Request, res: Response) => {
  const siteId = typeof req.query.siteId === "string" ? req.query.siteId : undefined;
  const floodStageRaw = req.query.floodStageFt;
  const floodStageFt =
    floodStageRaw !== undefined && !Number.isNaN(Number(floodStageRaw))
      ? Number(floodStageRaw)
      : undefined;

  if (!siteId) {
    res.status(400).json({ error: "siteId query param is required" });
    return;
  }

  try {
    const outcome = await evaluateUsgsGaugeHeight(siteId, floodStageFt);
    res.json({ siteId, floodStageFt: floodStageFt ?? null, outcome });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "USGS lookup failed", detail: message });
  }
});

app.listen(PORT, () => {
  console.log(`USDA facility decisions server listening on http://localhost:${PORT}`);
});
