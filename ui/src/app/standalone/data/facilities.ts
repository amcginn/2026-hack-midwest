/**
 * Ported from data/synthetic/facilities.yaml for the standalone
 * (no-backend, GitHub Pages) build -- hard-coded as a static TS module
 * since there's no server to read a YAML file from at runtime. Keep
 * in sync with the YAML source if facilities are added/changed there.
 * Same facility set as the full build (per user, 2026-10-12): these
 * locations were found to produce genuinely useful live scenarios
 * during the original build, so they're also the locations most
 * likely to have something worth demoing on a given day.
 */

import type { Facility } from "./types";

export const FACILITIES: Facility[] = [
  {
    facilityId: "USDA-FSA-IA-CLINTON",
    name: "USDA FSA Clinton County Office",
    address: { line1: "123 Example St", city: "Clinton", state: "IA", zip: "52732" },
    coordinates: { lat: 41.8847, lon: -90.1943 },
    hours: "08:00-16:30",
    buildingType: "office",
    accessibilityNotes: "ground-floor ADA accessible",
    riverGaugeId: "05420500",
  },
  {
    facilityId: "USDA-FSA-IA-DESMOINES",
    name: "USDA FSA Iowa State Office",
    address: { line1: "210 Walnut St", city: "Des Moines", state: "IA", zip: "50309" },
    coordinates: { lat: 41.5868, lon: -93.625 },
    hours: "08:00-16:30",
    buildingType: "office",
    accessibilityNotes: "ground-floor ADA accessible",
  },
  {
    facilityId: "USDA-FS-MT-BILLINGS",
    name: "USDA Forest Service Billings Field Office",
    address: { line1: "456 Example Ave", city: "Billings", state: "MT", zip: "59101" },
    coordinates: { lat: 45.7833, lon: -108.5007 },
    hours: "08:00-16:30",
    buildingType: "office",
    accessibilityNotes: "ground-floor ADA accessible",
  },
  {
    facilityId: "USDA-FS-MT-GREATFALLS",
    name: "USDA Forest Service Great Falls Office",
    address: { line1: "88 Central Ave", city: "Great Falls", state: "MT", zip: "59401" },
    coordinates: { lat: 47.5053, lon: -111.3008 },
    hours: "08:00-16:30",
    buildingType: "office",
    accessibilityNotes: "ground-floor ADA accessible",
  },
  {
    facilityId: "USDA-FS-AL-STATION",
    name: "USDA Forest Service Alabama Research Station",
    address: { line1: "321 Example Pkwy", city: "Montgomery", state: "AL", zip: "36101" },
    coordinates: { lat: 32.3792, lon: -86.3077 },
    hours: "08:00-16:30",
    buildingType: "research_station",
    accessibilityNotes: "ground-floor ADA accessible",
  },
  {
    facilityId: "USDA-FSA-CA-SANDIEGO",
    name: "USDA FSA San Diego County Office",
    address: { line1: "2345 Example Blvd", city: "San Diego", state: "CA", zip: "92101" },
    coordinates: { lat: 32.7157, lon: -117.1611 },
    hours: "08:00-16:30",
    buildingType: "office",
    accessibilityNotes: "ground-floor ADA accessible",
  },
  {
    facilityId: "USDA-FS-OR-PENDLETON",
    name: "USDA Forest Service Pendleton Ranger Station",
    address: { line1: "710 Example Rd", city: "Pendleton", state: "OR", zip: "97801" },
    coordinates: { lat: 45.6721, lon: -118.7886 },
    hours: "08:00-16:30",
    buildingType: "research_station",
    accessibilityNotes: "ground-floor ADA accessible",
  },
  {
    facilityId: "USDA-FSA-MO-KANSASCITY",
    name: "USDA FSA Kansas City Regional Office",
    address: { line1: "8900 E 11th St", city: "Kansas City", state: "MO", zip: "64126" },
    coordinates: { lat: 39.0997, lon: -94.5786 },
    hours: "08:00-16:30",
    buildingType: "office",
    accessibilityNotes: "ground-floor ADA accessible",
    riverGaugeId: "06893000",
  },
];

export function getAllFacilities(): Facility[] {
  return FACILITIES;
}

export function getFacilityById(facilityId: string): Facility | undefined {
  return FACILITIES.find((f) => f.facilityId === facilityId);
}
