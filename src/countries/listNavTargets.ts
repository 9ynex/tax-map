import { getChildren } from "../data/index";
import { listEnabledCountries } from "./registry";

/** One jumpable destination in the header region switcher (components/region-switcher.tsx). */
export interface NavTarget {
  id: string;
  label: string;
  href: string;
  group: string;
}

/**
 * World map + every enabled country + every region within it — the flat
 * list the header switcher searches. Server-only (node:fs via
 * getChildren); a page loads this once and passes it down as a plain
 * serializable prop, same pattern as listAllRegions.ts.
 */
export function listAllNavTargets(): NavTarget[] {
  const targets: NavTarget[] = [
    { id: "world", label: "World map", href: "/", group: "Global" },
  ];

  for (const country of listEnabledCountries()) {
    targets.push({
      id: country.urlSlug,
      label: `${country.name} (all regions)`,
      href: `/${country.urlSlug}`,
      group: country.name,
    });
    for (const region of getChildren(country.rootJurisdictionId)) {
      targets.push({
        id: region.id,
        label: region.name,
        href: `/${country.urlSlug}/${region.slug}`,
        group: country.name,
      });
    }
  }

  return targets;
}
