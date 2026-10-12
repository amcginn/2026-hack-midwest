/**
 * Ported from server/src/repository/facilityLinks.ts for the
 * standalone (no-backend, GitHub Pages) build.
 *
 * STORAGE: localStorage, not sessionStorage (reversed mid-build, per
 * user 2026-10-12: wanting to demo "I previously saved my local news
 * station's URL" and see it persist across sessions -- sessionStorage
 * clearing on tab-close would erase exactly the thing being
 * demonstrated). One localStorage key per facility, same shape as the
 * server version's one-JSON-file-per-facility pattern.
 */

const KEY_PREFIX = "facman-standalone:facility-links:";

export interface FacilityLink {
  id: string;
  label: string;
  url: string;
}

function keyFor(facilityId: string): string {
  return `${KEY_PREFIX}${facilityId}`;
}

export function getFacilityLinks(facilityId: string): FacilityLink[] {
  const raw = localStorage.getItem(keyFor(facilityId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error(`Could not parse facility links for ${facilityId} -- treating as empty, not crashing`);
    return [];
  }
}

function writeFacilityLinks(facilityId: string, links: FacilityLink[]): void {
  localStorage.setItem(keyFor(facilityId), JSON.stringify(links));
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
  const newLink: FacilityLink = { id: crypto.randomUUID(), label, url };
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
