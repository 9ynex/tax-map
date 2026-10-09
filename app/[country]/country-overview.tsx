import { Suspense } from "react";

import { getChildren } from "@/src/data/index";
import { loadCountrySnapshots } from "@/src/countries/loadCountrySnapshots";
import type { CountryConfig } from "@/src/countries/types";
import { MapExplorer } from "@/components/map/map-explorer";
import { TaxYearBadge } from "@/components/tax-year-badge";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { parseIncome, parseMetric, parsePins, parseView, type SearchParams } from "@/lib/url-state";

/**
 * Shared between app/page.tsx (default country at the site root, per
 * docs/frontend.md #2) and app/[country]/page.tsx (the permalink) so both
 * stay in sync without duplicating the data-loading/layout logic.
 */
export function CountryOverview({
  country,
  searchParams,
}: {
  country: CountryConfig;
  searchParams: SearchParams;
}) {
  const regions = getChildren(country.rootJurisdictionId).map((j) => ({
    jurisdictionId: j.id,
    slug: j.slug,
    name: j.name,
  }));
  const snapshotsByJurisdiction = loadCountrySnapshots(country);

  const income = parseIncome(searchParams, country.defaultIncome);
  const metric = parseMetric(searchParams);
  const view = parseView(searchParams);
  const pins = parsePins(searchParams);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Breadcrumbs items={[{ label: "World", href: "/" }, { label: country.name }]} />
        <TaxYearBadge taxYear={country.taxYear} />
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {country.name} income tax by region
        </h1>
        <p className="max-w-2xl text-sm text-muted">
          Drag the slider to see how effective tax rate, total tax, and take-home pay compare
          across every province and territory at your income level.
        </p>
      </div>
      <Suspense fallback={null}>
        <MapExplorer
          country={country}
          regions={regions}
          snapshotsByJurisdiction={snapshotsByJurisdiction}
          initialIncome={income}
          initialMetric={metric}
          initialView={view}
          initialPins={pins}
        />
      </Suspense>
    </div>
  );
}
