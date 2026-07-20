import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Suspense } from "react";

import { getChildren, loadSnapshotChain } from "@/src/data/index";
import { getEnabledCountryBySlug, listEnabledCountries } from "@/src/countries/index";
import { RegionDetail } from "@/components/breakdown/region-detail";
import { TaxYearBadge } from "@/components/tax-year-badge";
import { formatCurrency } from "@/lib/format";

/**
 * Pre-generated only for each country's curated income levels
 * (docs/seo.md #4) — `dynamicParams = false` means any other income segment
 * 404s instead of silently generating an unbounded number of routes.
 * Arbitrary slider values stay client-only, synced to `/{country}/{jurisdiction}?income=`.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return listEnabledCountries().flatMap((country) =>
    getChildren(country.rootJurisdictionId).flatMap((region) =>
      country.curatedIncomeLevels.map((income) => ({
        country: country.urlSlug,
        jurisdiction: region.slug,
        income: String(income),
      })),
    ),
  );
}

function resolve(countrySlug: string, jurisdictionSlug: string, incomeParam: string) {
  const country = getEnabledCountryBySlug(countrySlug);
  if (!country) return null;
  const region = getChildren(country.rootJurisdictionId).find((j) => j.slug === jurisdictionSlug);
  if (!region) return null;
  const income = Number(incomeParam);
  if (!country.curatedIncomeLevels.includes(income)) return null;
  return { country, region, income };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ country: string; jurisdiction: string; income: string }>;
}): Promise<Metadata> {
  const { country: countrySlug, jurisdiction: jurisdictionSlug, income: incomeParam } = await params;
  const resolved = resolve(countrySlug, jurisdictionSlug, incomeParam);
  if (!resolved) return {};
  const { country, region, income } = resolved;

  return {
    title: `${formatCurrency(income, country.currency)} income tax in ${region.name}`,
    description: `A ${formatCurrency(income, country.currency)} income breaks down to this much tax in ${region.name}, ${country.name} for tax year ${country.taxYear}.`,
  };
}

export default async function CuratedIncomePage({
  params,
}: {
  params: Promise<{ country: string; jurisdiction: string; income: string }>;
}) {
  const { country: countrySlug, jurisdiction: jurisdictionSlug, income: incomeParam } = await params;
  const resolved = resolve(countrySlug, jurisdictionSlug, incomeParam);
  if (!resolved) notFound();
  const { country, region, income } = resolved;

  const snapshots = loadSnapshotChain(region.id, country.taxYear);
  if (snapshots.length === 0) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/${country.urlSlug}/${region.slug}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {region.name}
      </Link>

      <div className="flex flex-col gap-2">
        <TaxYearBadge taxYear={country.taxYear} />
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {formatCurrency(income, country.currency)} in {region.name}
        </h1>
      </div>

      <Suspense fallback={null}>
        <RegionDetail
          jurisdictionId={region.id}
          jurisdictionName={region.name}
          taxYear={country.taxYear}
          currencySymbol={country.currencySymbol}
          snapshots={snapshots}
          initialIncome={income}
          filingStatus={country.defaultFilingStatus}
          commitBasePath={`/${country.urlSlug}/${region.slug}`}
        />
      </Suspense>
    </div>
  );
}
