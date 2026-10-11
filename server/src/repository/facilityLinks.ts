/**
 * Per-facility custom reference links -- curated, NOT scored/fetched
 * data sources. Lets a facility manager attach links a real person
 * would check but that don't have (or don't warrant building) a
 * dedicated adapter -- e.g. a local news station's closures page, a
 * county emergency management feed, a school district announcement
 * page. Directly generalizes the KDKD/GA-511 finding from section 1
 * ("exactly the kind of hyper-local, informal source a real facility
 * manager would check") into a reusable feature instead of a one-off
 * hardcoded adapter per such source.
 *
 * PERSISTENCE DESIGN (per user, 2026-10-11): facilities.yaml is
 * hand-authored seed data, loaded once into memory at server start
 * (see repository/facilities.ts) -- nothing writes back to it, and
 * editing it would require real file-rewrite + cache-invalidation
 * work that isn't worth the risk for this hackathon, especially since
 * a bad edit to lat/lon could silently break that facility's NWS zone
 * lookup. Links are different: purely additive, no other code depends
 * on them, safe to make genuinely writable. Same append/overwrite-a-
 * runtime-JSON-file pattern already used for decision records and the
 * notification log -- one file per facility here (not one shared
 * append-only log) since links are a small, fully-replaceable set per
 * facility, not an audit trail of discrete events.
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const FACILITY_LINKS_DIR = path.resolve(__dirname, "../../../data/facility-links");

export interface FacilityLink {
  id: string;
  label: string;
  url: string;
}

function filePathFor(facilityId: string): string {
  // facilityId is always one of our own known IDs (validated by the
  // route handler against getFacilityById before this is ever
  // called) -- no untrusted input reaches the filesystem path.
  return path.join(FACILITY_LINKS_DIR, `${facilityId}.json`);
}

function ensureDir(): void {
  if (!fs.existsSync(FACILITY_LINKS_DIR)) {
    fs.mkdirSync(FACILITY_LINKS_DIR, { recursive: true });
  }
}

/** Read fresh from disk on every call -- unlike facilities.ts's
 * cache-at-startup, links need to reflect an edit immediately without
 * a server restart, since the whole point is this is user-editable at
 * runtime. */
export function getFacilityLinks(facilityId: string): FacilityLink[] {
  const filePath = filePathFor(facilityId);
  if (!fs.existsSync(filePath)) return [];

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error(`Could not parse facility links file for ${facilityId} -- treating as empty, not crashing`);
    return [];
  }
}

function writeFacilityLinks(facilityId: string, links: FacilityLink[]): void {
  ensureDir();
  fs.writeFileSync(filePathFor(facilityId), JSON.stringify(links, null, 2), "utf-8");
}

/** Basic URL validation -- must be a real http(s) URL. Rejects
 * obviously malformed input before it's ever shown as a clickable
 * link on the dashboard (e.g. a javascript: URL or plain text typo). */
export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function addFacilityLink(facilityId: string, label: string, url: string): FacilityLink {
  const links = getFacilityLinks(facilityId);
  const newLink: FacilityLink = { id: randomUUID(), label, url };
  writeFacilityLinks(facilityId, [...links, newLink]);
  return newLink;
}

export function removeFacilityLink(facilityId: string, linkId: string): boolean {
  const links = getFacilityLinks(facilityId);
  const filtered = links.filter((l) => l.id !== linkId);
  if (filtered.length === links.length) return false; // nothing removed
  writeFacilityLinks(facilityId, filtered);
  return true;
}
