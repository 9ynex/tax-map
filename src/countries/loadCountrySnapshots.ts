import { getChildren, loadSnapshotChain } from "../data/index";
import type { TaxYearSnapshot } from "../data/schema";
import type { CountryConfig } from "./types";

/**
 * Server-only (node:fs via the data layer). Loads every direct-child
 * jurisdiction's snapshot chain (federal + that region) for a country in
 * one pass, so a country overview page can compute every region's tax at
 * once for the map/list, and ship the raw chains to the client so it can
 * recompute live as the income slider moves (see
 * src/calc/computeTaxFromChain.ts).
 *
 * Assumes one level of regions under the country root (true for CA/US v1).
 * A country with deeper hierarchy (e.g. Japan: prefecture + municipality)
 * would need its own region-listing strategy — not a schema change, per
 * docs/data.md's extensibility section, but this helper's simple "direct
 * children of root" assumption would need revisiting for that country.
 */
export function loadCountrySnapshots(
  country: CountryConfig,
): Record<string, TaxYearSnapshot[]> {
  const regions = getChildren(country.rootJurisdictionId);
  const chains: Record<string, TaxYearSnapshot[]> = {};
  for (const region of regions) {
    chains[region.id] = loadSnapshotChain(region.id, country.taxYear);
  }
  return chains;
}
