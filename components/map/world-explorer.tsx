"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { computeTaxFromChain } from "@/src/calc/computeTaxFromChain";
import { convertAmount } from "@/src/calc/currency";
import type { WorldCountryData } from "@/src/countries/loadWorldData";
import type { ExchangeRateSnapshot } from "@/src/data/schema";
import { IncomeInput } from "@/components/income-input";
import { WorldMap, type WorldCountryValue } from "@/components/map/world-map";
import { formatPercent } from "@/lib/format";
import { rateToColor } from "@/lib/color-scale";
import { buildQuery } from "@/lib/url-state";

/** amount, already converted into that country's own currency (PPP-equivalent to the USD slider). */
function incomeFor(
  income: number,
  currency: string,
  exchangeRates: ExchangeRateSnapshot | null,
): number {
  if (!exchangeRates) return income;
  try {
    return convertAmount(income, "USD", currency, exchangeRates);
  } catch {
    // Currency not covered by this year's snapshot — fall back to the raw
    // USD figure rather than crashing (see data/README.md's exchange-rate
    // section); every currently-enabled country's currency is covered.
    return income;
  }
}

/**
 * The site root (docs/frontend.md decision: world map replaces the old
 * "defaults to one country" root). The slider is denominated in USD; each
 * country's effective rate is computed against the PPP-converted equivalent
 * of that USD figure in its own currency (src/calc/currency.ts), not the
 * raw number reused across currencies — comparing "$75,000" against "¥75,000"
 * would silently contrast a well-off person against a very different one.
 * Colors by each country's *average* effective rate across all its own
 * regions — currency-agnostic by construction, so this stays the right
 * aggregate even now that amounts are converted.
 */
export function WorldExplorer({
  countries,
  initialIncome,
  exchangeRates,
}: {
  countries: WorldCountryData[];
  initialIncome: number;
  /** PPP-basis rates for the tax year (src/data/exchangeRates.ts), or null if no snapshot exists yet. */
  exchangeRates: ExchangeRateSnapshot | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [income, setIncome] = React.useState(initialIncome);

  const incomeByCountry = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const country of countries) {
      map.set(country.urlSlug, incomeFor(income, country.currency, exchangeRates));
    }
    return map;
  }, [countries, income, exchangeRates]);

  const countryValues: WorldCountryValue[] = React.useMemo(() => {
    const raw = countries.map((country) => {
      const countryIncome = incomeByCountry.get(country.urlSlug)!;
      const rates = country.regions.map((region) => {
        const snapshots = country.snapshotsByJurisdiction[region.jurisdictionId] ?? [];
        return computeTaxFromChain(snapshots, {
          jurisdictionId: region.jurisdictionId,
          income: countryIncome,
          taxYear: country.taxYear,
          filingStatus: country.defaultFilingStatus,
        }).effectiveRate;
      });
      const value = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
      return {
        countrySlug: country.urlSlug,
        name: country.name,
        value,
        formattedValue: formatPercent(value),
      };
    });

    const values = raw.map((r) => r.value);
    const min = Math.min(...values);
    const max = Math.max(...values);

    return raw.map((r) => ({ ...r, color: rateToColor(r.value, min, max, false) }));
  }, [countries, incomeByCountry]);

  const commit = React.useCallback(
    (value: number) => {
      const params = Object.fromEntries(searchParams.entries());
      const qs = buildQuery(params, { income: String(Math.round(value)) });
      router.replace(`${pathname}${qs}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const handleSelect = React.useCallback(
    (countrySlug: string) => {
      // The destination country page expects income in *its own* currency,
      // not the USD figure on this slider — otherwise clicking into Japan
      // would carry over a raw number as if it were yen.
      const countryIncome = incomeByCountry.get(countrySlug) ?? income;
      router.push(`/${countrySlug}?income=${Math.round(countryIncome)}`);
    },
    [router, income, incomeByCountry],
  );

  return (
    <div className="flex w-full flex-col gap-6">
      <IncomeInput income={income} currencySymbol="$" onChange={setIncome} onCommit={commit} />

      <p className="text-sm text-muted">
        Colored by each country's average effective tax rate across all its regions, at this
        income in USD{" "}
        {exchangeRates ? (
          <>
            converted to each country's own currency at the {exchangeRates.year}{" "}
            <a
              href={exchangeRates.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              IMF purchasing-power-parity rate
            </a>{" "}
            — comparable buying power, not a market exchange rate.
          </>
        ) : (
          "(no exchange-rate data available for this tax year, so figures are shown unconverted)."
        )}
      </p>

      <WorldMap countries={countryValues} onSelect={handleSelect} />

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <span>Browse:</span>
        {countries.map((country, i) => (
          <React.Fragment key={country.urlSlug}>
            {i > 0 && <span aria-hidden>·</span>}
            <Link href={`/${country.urlSlug}`} className="hover:text-foreground">
              {country.name}
            </Link>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
