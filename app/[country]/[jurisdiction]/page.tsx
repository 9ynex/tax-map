import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { getChildren, loadSnapshotChain } from "@/src/data/index";
import { computeTaxFromChain } from "@/src/calc/computeTaxFromChain";
import { getEnabledCountryBySlug, listEnabledCountries } from "@/src/countries/index";
import { listAllRegions } from "@/src/countries/listAllRegions";
import { RegionDetail } from "@/components/breakdown/region-detail";
import { TaxYearBadge } from "@/components/tax-year-badge";
import { ComparePicker } from "@/components/compare-picker";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { parseIncome } from "@/lib/url-state";
import { formatCurrency, formatPercent } from "@/lib/format";

export function generateStaticParams() {
  return listEnabledCountries().flatMap((country) =>
    getChildren(country.rootJurisdictionId).map((region) => ({
      country: country.urlSlug,
      jurisdiction: region.slug,
    })),
  );
}

function resolveRegion(countrySlug: string, jurisdictionSlug: string) {
  const country = getEnabledCountryBySlug(countrySlug);
  if (!country) return null;
  const region = getChildren(country.rootJurisdictionId).find((j) => j.slug === jurisdictionSlug);
  if (!region) return null;
  return { country, region };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ country: string; jurisdiction: string }>;
}): Promise<Metadata> {
  const { country: countrySlug, jurisdiction: jurisdictionSlug } = await params;
  const resolved = resolveRegion(countrySlug, jurisdictionSlug);
  if (!resolved) return {};
  const { country, region } = resolved;

  return {
    title: `${region.name} income tax — ${country.taxYear}`,
    description: `How much income tax you pay in ${region.name}, ${country.name} for tax year ${country.taxYear}, broken down by component.`,
  };
}

export default async function JurisdictionPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: string; jurisdiction: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { country: countrySlug, jurisdiction: jurisdictionSlug } = await params;
  const resolved = resolveRegion(countrySlug, jurisdictionSlug);
  if (!resolved) notFound();
  const { country, region } = resolved;

  const snapshots = loadSnapshotChain(region.id, country.taxYear);
  if (snapshots.length === 0) notFound();

  const sp = await searchParams;
  const income = parseIncome(sp, country.defaultIncome);

  const sourceUrls = Array.from(
    new Set(snapshots.flatMap((s) => s.components.map((c) => c.sourceUrl).filter(Boolean))),
  ) as string[];

  // FAQPage JSON-LD at the default income competes for featured snippets
  // (docs/seo.md #6) — e.g. "How much tax do I pay in Ontario on $55,000?"
  const defaultBreakdown = computeTaxFromChain(snapshots, {
    jurisdictionId: region.id,
    income: country.defaultIncome,
    taxYear: country.taxYear,
    filingStatus: country.defaultFilingStatus,
  });
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `How much income tax do I pay in ${region.name} on ${formatCurrency(country.defaultIncome, defaultBreakdown.currency)}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `On ${formatCurrency(country.defaultIncome, defaultBreakdown.currency)} of income in ${region.name} for tax year ${country.taxYear}, total tax is approximately ${formatCurrency(defaultBreakdown.totalTax, defaultBreakdown.currency)}, an effective rate of ${formatPercent(defaultBreakdown.effectiveRate)}. This is an estimate, not tax advice.`,
        },
      },
    ],
  };

  return (
    <div className="flex flex-col gap-6">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="flex flex-col gap-3">
        <Breadcrumbs
          items={[
            { label: "World", href: "/" },
            { label: country.name, href: `/${country.urlSlug}` },
            { label: region.name },
          ]}
        />
        <TaxYearBadge taxYear={country.taxYear} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{region.name}</h1>
          <ComparePicker
            currentRegion={{ jurisdictionId: region.id, name: region.name }}
            allRegions={listAllRegions()}
            income={income}
          />
        </div>
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
        />
      </Suspense>

      {sourceUrls.length > 0 && (
        <div className="flex flex-col gap-1 text-xs text-muted">
          <span>Sources:</span>
          <ul className="list-inside list-disc">
            {sourceUrls.map((url) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                  {new URL(url).hostname}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
