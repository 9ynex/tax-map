import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { getAncestors, getChildren, getJurisdiction, loadSnapshotChain } from "@/src/data/index";
import { computeTaxFromChain } from "@/src/calc/computeTaxFromChain";
import { listEnabledCountries } from "@/src/countries/index";
import type { CountryConfig } from "@/src/countries/types";
import { CompareView } from "@/components/breakdown/compare-view";
import { TaxYearBadge } from "@/components/tax-year-badge";
import { parseIncome } from "@/lib/url-state";
import { formatCurrency, formatPercent } from "@/lib/format";

/** Canonicalize comparison direction (docs/seo.md #4): alphabetical a < b, redirect the reverse. */
function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function resolveCountryFor(jurisdictionId: string): CountryConfig | undefined {
  const [root] = getAncestors(jurisdictionId);
  if (!root) return undefined;
  return listEnabledCountries().find((c) => c.rootJurisdictionId === root.id);
}

/**
 * Every region across every enabled country, paired against every other —
 * cross-country pairs (e.g. a US state vs a Canadian province) are valid
 * routes now that the compare picker (components/compare-picker.tsx) can
 * select across countries. See docs/data.md's comparison-scope note: v1
 * still doesn't convert currencies, so cross-currency pairs compare
 * effective rate (currency-agnostic) while keeping each side's dollar
 * figures in its own currency — CompareView renders that distinction.
 */
export function generateStaticParams() {
  const regionIds = listEnabledCountries().flatMap((country) =>
    getChildren(country.rootJurisdictionId).map((j) => j.id),
  );
  const pairs: { a: string; b: string }[] = [];
  for (let i = 0; i < regionIds.length; i++) {
    for (let j = i + 1; j < regionIds.length; j++) {
      const [a, b] = canonicalPair(regionIds[i]!, regionIds[j]!);
      pairs.push({ a, b });
    }
  }
  return pairs;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ a: string; b: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { a, b } = await params;
  const regionA = getJurisdiction(a);
  const regionB = getJurisdiction(b);
  if (!regionA || !regionB) return {};

  const countryA = resolveCountryFor(a);
  const countryB = resolveCountryFor(b);
  if (!countryA || !countryB) {
    return {
      title: `${regionA.name} vs ${regionB.name} — tax comparison`,
      description: `Compare income tax between ${regionA.name} and ${regionB.name} side by side.`,
    };
  }

  // A number-bearing description ("29.9% vs 25.4%") reads as real content in
  // search results rather than a generic template — same reasoning as the
  // FAQPage answer below, and cheap since the breakdowns are already needed
  // there too.
  const sp = await searchParams;
  const income = parseIncome(sp, countryA.defaultIncome);
  const snapshotsA = loadSnapshotChain(a, countryA.taxYear);
  const snapshotsB = loadSnapshotChain(b, countryB.taxYear);
  const rateA = computeTaxFromChain(snapshotsA, {
    jurisdictionId: a,
    income,
    taxYear: countryA.taxYear,
    filingStatus: countryA.defaultFilingStatus,
  }).effectiveRate;
  const rateB = computeTaxFromChain(snapshotsB, {
    jurisdictionId: b,
    income,
    taxYear: countryB.taxYear,
    filingStatus: countryB.defaultFilingStatus,
  }).effectiveRate;

  return {
    title: `${regionA.name} vs ${regionB.name} — tax comparison`,
    description:
      `At ${formatCurrency(income, countryA.currency)} income: ${regionA.name} ` +
      `${formatPercent(rateA)} effective rate vs ${regionB.name} ${formatPercent(rateB)}. ` +
      `Compare income tax side by side.`,
  };
}

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ a: string; b: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { a, b } = await params;
  if (a === b) notFound();

  const [canonicalA, canonicalB] = canonicalPair(a, b);
  const sp = await searchParams;
  if (a !== canonicalA) {
    const qs = new URLSearchParams(sp as Record<string, string>).toString();
    redirect(`/compare/${canonicalA}/${canonicalB}${qs ? `?${qs}` : ""}`);
  }

  const regionA = getJurisdiction(canonicalA);
  const regionB = getJurisdiction(canonicalB);
  if (!regionA || !regionB) notFound();

  // Cross-country (and so cross-currency) pairs are allowed — v1 still has
  // no FX conversion (docs/data.md), so CompareView compares effective
  // rate (currency-agnostic) and keeps each side's dollar figures in its
  // own currency rather than implying a false equivalence.
  const countryA = resolveCountryFor(canonicalA);
  const countryB = resolveCountryFor(canonicalB);
  if (!countryA || !countryB) notFound();

  const snapshotsA = loadSnapshotChain(canonicalA, countryA.taxYear);
  const snapshotsB = loadSnapshotChain(canonicalB, countryB.taxYear);
  if (snapshotsA.length === 0 || snapshotsB.length === 0) notFound();

  const income = parseIncome(sp, countryA.defaultIncome);

  // FAQPage JSON-LD targets the "X vs Y taxes" comparison search pattern
  // (docs/seo.md #6) the same way the single-region pages already target
  // "how much tax do I pay in X" — a real, numbers-bearing Q&A rather than
  // boilerplate, computed from the same breakdown the page renders.
  const breakdownA = computeTaxFromChain(snapshotsA, {
    jurisdictionId: canonicalA,
    income,
    taxYear: countryA.taxYear,
    filingStatus: countryA.defaultFilingStatus,
  });
  const breakdownB = computeTaxFromChain(snapshotsB, {
    jurisdictionId: canonicalB,
    income,
    taxYear: countryB.taxYear,
    filingStatus: countryB.defaultFilingStatus,
  });
  const [lower, higher] =
    breakdownA.effectiveRate <= breakdownB.effectiveRate
      ? [{ region: regionA, breakdown: breakdownA }, { region: regionB, breakdown: breakdownB }]
      : [{ region: regionB, breakdown: breakdownB }, { region: regionA, breakdown: breakdownA }];
  const sameCurrency = breakdownA.currency === breakdownB.currency;
  const rateDiffPoints = (higher.breakdown.effectiveRate - lower.breakdown.effectiveRate) * 100;

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `${regionA.name} vs ${regionB.name}: which has lower income tax on ${formatCurrency(income, countryA.currency)}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: sameCurrency
            ? `On ${formatCurrency(income, countryA.currency)} of income for tax year ${countryA.taxYear}, ` +
              `${lower.region.name} has the lower effective rate at ${formatPercent(lower.breakdown.effectiveRate)}, ` +
              `versus ${formatPercent(higher.breakdown.effectiveRate)} in ${higher.region.name} — ` +
              `a difference of about ${formatCurrency(higher.breakdown.totalTax - lower.breakdown.totalTax, countryA.currency)} in total tax. ` +
              `This is an estimate, not tax advice.`
            : `On an equivalent income of ${formatCurrency(income, countryA.currency)}/${formatCurrency(income, countryB.currency)}, ` +
              `${lower.region.name} has the lower effective rate at ${formatPercent(lower.breakdown.effectiveRate)}, ` +
              `versus ${formatPercent(higher.breakdown.effectiveRate)} in ${higher.region.name} — ` +
              `${rateDiffPoints.toFixed(1)} percentage points higher. Figures are in each region's own currency ` +
              `(${breakdownA.currency}/${breakdownB.currency}), not converted. This is an estimate, not tax advice.`,
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
      <div className="flex flex-col gap-2">
        {countryA.taxYear === countryB.taxYear ? (
          <TaxYearBadge taxYear={countryA.taxYear} />
        ) : (
          <div className="flex gap-2">
            <TaxYearBadge taxYear={countryA.taxYear} />
            <TaxYearBadge taxYear={countryB.taxYear} />
          </div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {regionA.name} vs {regionB.name}
        </h1>
      </div>

      <Suspense fallback={null}>
        <CompareView
          currencySymbol={countryA.currencySymbol}
          regions={[
            {
              jurisdictionId: regionA.id,
              name: regionA.name,
              snapshots: snapshotsA,
              taxYear: countryA.taxYear,
              filingStatus: countryA.defaultFilingStatus,
            },
            {
              jurisdictionId: regionB.id,
              name: regionB.name,
              snapshots: snapshotsB,
              taxYear: countryB.taxYear,
              filingStatus: countryB.defaultFilingStatus,
            },
          ]}
          initialIncome={income}
        />
      </Suspense>
    </div>
  );
}
