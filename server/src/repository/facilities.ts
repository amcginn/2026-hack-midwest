/**
 * Facility repository. File-backed (data/synthetic/facilities.yaml),
 * loaded once at startup into memory.
 *
 * Deliberately DynamoDB-shaped per docs/project-scope.md section 6:
 * facilityId is the natural partition key. Swapping this for a real
 * DynamoDB client later should only require changing this file.
 */

import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { Facility } from "./types";
import { SYNTHETIC_DATA_DIR } from "./dataPaths";

interface FacilitiesFile {
  facilities: Facility[];
}

let cache: Map<string, Facility> | undefined;

function loadFacilities(): Map<string, Facility> {
  if (cache) return cache;

  const filePath = path.join(SYNTHETIC_DATA_DIR, "facilities.yaml");
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = YAML.parse(raw) as FacilitiesFile;

  const map = new Map<string, Facility>();
  for (const facility of parsed.facilities) {
    map.set(facility.facilityId, facility);
  }

  cache = map;
  return map;
}

export function getAllFacilities(): Facility[] {
  return Array.from(loadFacilities().values());
}

export function getFacilityById(facilityId: string): Facility | undefined {
  return loadFacilities().get(facilityId);
}
