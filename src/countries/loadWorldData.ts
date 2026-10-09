import { getChildren } from "../data/index";
import type { FilingStatus, TaxYearSnapshot } from "../data/schema";
import { loadCountrySnapshots } from "./loadCountrySnapshots";
import { listEnabledCountries } from "./registry";

export interface WorldCountryData {
  urlSlug: string;
  name: string;
  taxYear: number;
  currency: string;
  defaultFilingStatus?: FilingStatus;
  defaultIncome: number;
  regions: { jurisdictionId: string; name: string }[];
  snapshotsByJurisdiction: Record<string, TaxYearSnapshot[]>;
}

/**
 * Server-only (node:fs via loadCountrySnapshots/getChildren). Loads every
 * enabled country's full region snapshot set in one pass, so the world map
 * can compute each country's aggregate effective rate client-side and
 * recompute it live as the income slider moves — same "ship the raw data,
 * recompute with zero network round-trip" pattern as loadCountrySnapshots
 * (see its own doc comment), just one level up.
 */
export function loadWorldData(): WorldCountryData[] {
  return listEnabledCountries().map((country) => ({
    urlSlug: country.urlSlug,
    name: country.name,
    taxYear: country.taxYear,
    currency: country.currency,
    defaultFilingStatus: country.defaultFilingStatus,
    defaultIncome: country.defaultIncome,
    regions: getChildren(country.rootJurisdictionId).map((j) => ({
      jurisdictionId: j.id,
      name: j.name,
    })),
    snapshotsByJurisdiction: loadCountrySnapshots(country),
  }));
}
