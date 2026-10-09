"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";

import { computeTaxFromChain } from "@/src/calc/computeTaxFromChain";
import { convertAmount } from "@/src/calc/currency";
import type { ExchangeRateSnapshot, FilingStatus, TaxYearSnapshot } from "@/src/data/schema";
import { IncomeInput } from "@/components/income-input";
import { TaxBreakdownPanel } from "@/components/breakdown/tax-breakdown";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/format";
import { buildQuery } from "@/lib/url-state";

interface RegionSnapshots {
  jurisdictionId: string;
  name: string;
  snapshots: TaxYearSnapshot[];
  taxYear: number;
  currency: string;
  /** That region's own country's default filing status — see docs/frontend.md #8. */
  filingStatus?: FilingStatus;
}

export function CompareView({
  currencySymbol,
  regions,
  initialIncome,
  exchangeRates,
}: {
  /** Shown on the shared income input — this is always regions[0]'s currency; regions[1] converts (see below). */
  currencySymbol: string;
  regions: [RegionSnapshots, RegionSnapshots];
  initialIncome: number;
  /**
   * PPP-basis rates for the tax year (src/data/exchangeRates.ts), or null if
   * no snapshot exists for it yet. Null degrades gracefully to the old
   * unconverted behavior rather than crashing — see `conversion` below.
   */
  exchangeRates: ExchangeRateSnapshot | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [income, setIncome] = React.useState(initialIncome);

  const [regionA, regionB] = regions;
  const crossCurrency = regionA!.currency !== regionB!.currency;

  // The income slider is always denominated in regionA's currency. For a
  // same-currency pair this is the whole story. For a cross-currency pair,
  // naively reusing the same number for regionB (comparing "100,000" as if
  // JPY and CAD were interchangeable) is exactly the misleading comparison
  // this converts away from: regionB's actual computation uses its PPP
  // equivalent instead, e.g. income of 100,000 CAD becomes ~500,000 DKK
  // before Greenland's tax brackets ever see it, rather than a raw 100,000.
  // Falls back to the unconverted number (and says so in the UI) if there's
  // no exchange-rate snapshot yet, or a currency it doesn't cover.
  const conversion = React.useMemo(() => {
    if (!crossCurrency || !exchangeRates) return null;
    try {
      return {
        convertedIncome: convertAmount(income, regionA!.currency, regionB!.currency, exchangeRates),
        year: exchangeRates.year,
        sourceUrl: exchangeRates.sourceUrl,
      };
    } catch {
      return null;
    }
  }, [crossCurrency, exchangeRates, income, regionA, regionB]);

  const incomesByRegion = React.useMemo(
    () => [income, conversion ? conversion.convertedIncome : income],
    [income, conversion],
  );

  const breakdowns = React.useMemo(
    () =>
      regions.map((r, i) =>
        computeTaxFromChain(r.snapshots, {
          jurisdictionId: r.jurisdictionId,
          income: incomesByRegion[i]!,
          taxYear: r.taxYear,
          filingStatus: r.filingStatus,
        }),
      ),
    [regions, incomesByRegion],
  );

  const commit = React.useCallback(
    (value: number) => {
      const params = Object.fromEntries(searchParams.entries());
      const qs = buildQuery(params, { income: String(Math.round(value)) });
      router.replace(`${pathname}${qs}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const [breakdownA, breakdownB] = breakdowns;
  const rateDiffPoints = Math.abs(breakdownA!.effectiveRate - breakdownB!.effectiveRate) * 100;
  const higherRegion =
    breakdownA!.effectiveRate === breakdownB!.effectiveRate
      ? null
      : breakdownA!.effectiveRate > breakdownB!.effectiveRate
        ? regions[0]
        : regions[1];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-6"
    >
      <IncomeInput income={income} currencySymbol={currencySymbol} onChange={setIncome} onCommit={commit} />

      {higherRegion && (
        <p className="text-sm text-muted">
          <span className="font-medium text-foreground">{higherRegion.name}</span>'s effective
          rate is <span className="font-medium text-foreground">{rateDiffPoints.toFixed(1)} points
          higher</span> than the other region's.
          {crossCurrency && conversion && (
            <>
              {" "}
              {regionB!.name}'s figures use {formatCurrency(conversion.convertedIncome, regionB!.currency)},
              converted from {formatCurrency(income, regionA!.currency)} at the {conversion.year}{" "}
              <a
                href={conversion.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                IMF purchasing-power-parity rate
              </a>{" "}
              — comparable buying power, not a market exchange rate.
            </>
          )}
          {crossCurrency && !conversion && (
            <>
              {" "}
              Rates are directly comparable; dollar figures below are each shown in that
              region's own currency (not converted — no exchange-rate data available for this pair).
            </>
          )}
        </p>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {regions.map((region, i) => {
          const breakdown = breakdowns[i]!;
          const isConvertedRegion = i === 1 && crossCurrency && conversion !== null;
          return (
            <Card key={region.jurisdictionId}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {region.name}
                    {crossCurrency && <Badge variant="outline">{breakdown.currency}</Badge>}
                  </span>
                  <span className="font-mono text-sm text-muted">
                    {formatPercent(breakdown.effectiveRate)}
                  </span>
                </CardTitle>
                {isConvertedRegion && (
                  <p className="text-xs text-muted">
                    ≈ {formatCurrency(conversion!.convertedIncome, region.currency)} PPP-equivalent income
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <TaxBreakdownPanel breakdown={breakdown} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </motion.div>
  );
}
