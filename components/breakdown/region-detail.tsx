"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";

import { computeTaxFromChain } from "@/src/calc/computeTaxFromChain";
import type { FilingStatus, TaxYearSnapshot } from "@/src/data/schema";
import { IncomeInput } from "@/components/income-input";
import { TaxBreakdownPanel } from "@/components/breakdown/tax-breakdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildQuery } from "@/lib/url-state";

export function RegionDetail({
  jurisdictionId,
  jurisdictionName,
  taxYear,
  currencySymbol,
  snapshots,
  initialIncome,
  filingStatus,
  commitBasePath,
}: {
  jurisdictionId: string;
  jurisdictionName: string;
  taxYear: number;
  currencySymbol: string;
  snapshots: TaxYearSnapshot[];
  initialIncome: number;
  /** Country's default filing status (docs/frontend.md #8 — not a user-facing selector yet). */
  filingStatus?: FilingStatus;
  /**
   * Path the income slider syncs to on commit. Defaults to the current
   * pathname. The curated income-level pages (docs/seo.md #4, e.g.
   * /ca/on/75000) pass the jurisdiction's base path instead, since dragging
   * the slider away from a curated value should land on `/ca/on?income=...`
   * rather than a non-existent static route like `/ca/on/75000?income=...`.
   */
  commitBasePath?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [income, setIncome] = React.useState(initialIncome);

  const breakdown = React.useMemo(
    () => computeTaxFromChain(snapshots, { jurisdictionId, income, taxYear, filingStatus }),
    [snapshots, jurisdictionId, income, taxYear, filingStatus],
  );

  const commit = React.useCallback(
    (value: number) => {
      const params = Object.fromEntries(searchParams.entries());
      const qs = buildQuery(params, { income: String(Math.round(value)) });
      router.replace(`${commitBasePath ?? pathname}${qs}`, { scroll: false });
    },
    [commitBasePath, pathname, router, searchParams],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-6"
    >
      <IncomeInput
        income={income}
        currencySymbol={currencySymbol}
        onChange={setIncome}
        onCommit={commit}
      />

      <Card>
        <CardHeader>
          <CardTitle>{jurisdictionName} tax breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <TaxBreakdownPanel breakdown={breakdown} />
        </CardContent>
      </Card>
    </motion.div>
  );
}
