import { getChildren } from "../data/index";
import { listEnabledCountries } from "./registry";

/**
 * One entry per selectable region across every enabled country — the flat
 * list the cross-country compare picker searches (components/compare-picker.tsx).
 * Server-only (node:fs via getChildren); a page loads this once and passes
 * it down as a plain serializable prop.
 */
export interface ComparableRegion {
  jurisdictionId: string;
  name: string;
  regionSlug: string;
  countryName: string;
  countrySlug: string;
  currency: string;
}

export function listAllRegions(): ComparableRegion[] {
  return listEnabledCountries().flatMap((country) =>
    getChildren(country.rootJurisdictionId).map((region) => ({
      jurisdictionId: region.id,
      name: region.name,
      regionSlug: region.slug,
      countryName: country.name,
      countrySlug: country.urlSlug,
      currency: country.currency,
    })),
  );
}
