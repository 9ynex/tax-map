"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";

import { computeTaxFromChain } from "@/src/calc/computeTaxFromChain";
import type { FilingStatus, TaxYearSnapshot } from "@/src/data/schema";
import { IncomeInput } from "@/components/income-input";
import { TaxBreakdownPanel } from "@/components/breakdown/tax-breakdown";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPercent } from "@/lib/format";
import { buildQuery } from "@/lib/url-state";

interface RegionSnapshots {
  jurisdictionId: string;
  name: string;
  snapshots: TaxYearSnapshot[];
  taxYear: number;
  /** That region's own country's default filing status — see docs/frontend.md #8. */
  filingStatus?: FilingStatus;
}

export function CompareView({
  currencySymbol,
  regions,
  initialIncome,
}: {
  /** Shown on the shared income input — both current countries use "$", so one symbol is enough for now. */
  currencySymbol: string;
  regions: [RegionSnapshots, RegionSnapshots];
  initialIncome: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [income, setIncome] = React.useState(initialIncome);

  const breakdowns = React.useMemo(
    () =>
      regions.map((r) =>
        computeTaxFromChain(r.snapshots, {
          jurisdictionId: r.jurisdictionId,
          income,
          taxYear: r.taxYear,
          filingStatus: r.filingStatus,
        }),
      ),
    [regions, income],
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
  const crossCurrency = breakdownA!.currency !== breakdownB!.currency;
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
          {crossCurrency && (
            <>
              {" "}
              Rates are directly comparable; dollar figures below are each shown in that
              region's own currency (not converted).
            </>
          )}
        </p>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {regions.map((region, i) => {
          const breakdown = breakdowns[i]!;
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
