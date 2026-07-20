"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import { computeTaxFromChain } from "@/src/calc/computeTaxFromChain";
import type { TaxYearSnapshot } from "@/src/data/schema";
import type { CountryConfig } from "@/src/countries/types";
import { IncomeInput } from "@/components/income-input";
import { TaxMap, type MapRegionValue } from "@/components/map/tax-map";
import { RegionList } from "@/components/map/region-list";
import { MetricToggle, ViewToggle } from "@/components/map/view-controls";
import { CompareBar } from "@/components/map/compare-bar";
import { formatCurrency, formatPercent } from "@/lib/format";
import { rateToColor } from "@/lib/color-scale";
import { buildQuery, type MapMetric, type ViewMode } from "@/lib/url-state";

interface RegionInfo {
  jurisdictionId: string;
  slug: string;
  name: string;
}

export function MapExplorer({
  country,
  regions,
  snapshotsByJurisdiction,
  initialIncome,
  initialMetric,
  initialView,
  initialPins,
}: {
  country: CountryConfig;
  regions: RegionInfo[];
  snapshotsByJurisdiction: Record<string, TaxYearSnapshot[]>;
  initialIncome: number;
  initialMetric: MapMetric;
  initialView: ViewMode;
  initialPins: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [income, setIncome] = React.useState(initialIncome);
  const [metric, setMetric] = React.useState<MapMetric>(initialMetric);
  const [view, setView] = React.useState<ViewMode>(initialView);
  const [pins, setPins] = React.useState<string[]>(initialPins);

  const syncUrl = React.useCallback(
    (overrides: Partial<Record<"income" | "metric" | "view" | "pins", string | undefined>>) => {
      const params = Object.fromEntries(searchParams.entries());
      const qs = buildQuery(params, overrides);
      router.replace(`${pathname}${qs}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // v1 only ever pins within a single country's page, so every candidate
  // already shares that country's currency — see docs/data.md's
  // same-currency comparison restriction.
  const togglePin = React.useCallback(
    (jurisdictionId: string) => {
      setPins((prev) => {
        const next = prev.includes(jurisdictionId)
          ? prev.filter((id) => id !== jurisdictionId)
          : [...prev, jurisdictionId].slice(-2);
        syncUrl({ pins: next.length ? next.join(",") : undefined });
        return next;
      });
    },
    [syncUrl],
  );

  const higherIsBetter = metric === "net";

  const regionValues: MapRegionValue[] = React.useMemo(() => {
    const raw = regions.map((region) => {
      const snapshots = snapshotsByJurisdiction[region.jurisdictionId] ?? [];
      const breakdown = computeTaxFromChain(snapshots, {
        jurisdictionId: region.jurisdictionId,
        income,
        taxYear: country.taxYear,
        filingStatus: country.defaultFilingStatus,
      });
      const value =
        metric === "rate"
          ? breakdown.effectiveRate
          : metric === "tax"
            ? breakdown.totalTax
            : breakdown.netIncome;
      const formattedValue = metric === "rate" ? formatPercent(value) : formatCurrency(value, breakdown.currency);
      return { ...region, value, formattedValue };
    });

    const values = raw.map((r) => r.value);
    const min = Math.min(...values);
    const max = Math.max(...values);

    return raw.map((r) => ({
      ...r,
      color: rateToColor(r.value, min, max, higherIsBetter),
    }));
  }, [regions, snapshotsByJurisdiction, income, metric, country.taxYear, higherIsBetter]);

  const handleSelect = React.useCallback(
    (jurisdictionId: string) => {
      const region = regions.find((r) => r.jurisdictionId === jurisdictionId);
      if (!region) return;
      router.push(`/${country.urlSlug}/${region.slug}?income=${Math.round(income)}`);
    },
    [regions, router, country.urlSlug, income],
  );

  return (
    <div className="flex w-full flex-col gap-6">
      <IncomeInput
        income={income}
        currencySymbol={country.currencySymbol}
        onChange={setIncome}
        onCommit={(value) => syncUrl({ income: String(Math.round(value)) })}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MetricToggle
          value={metric}
          onChange={(value) => {
            setMetric(value);
            syncUrl({ metric: value });
          }}
        />
        <ViewToggle
          value={view}
          onChange={(value) => {
            setView(value);
            syncUrl({ view: value });
          }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {view === "map" ? (
            <TaxMap
              topologyUrl={country.map.topologyUrl}
              objectName={country.map.objectName}
              projection={country.map.projection}
              center={country.map.center}
              scale={country.map.scale}
              regions={regionValues}
              onSelect={handleSelect}
            />
          ) : (
            <RegionList
              regions={regionValues}
              onSelect={handleSelect}
              metricLabel={metric === "rate" ? "Effective rate" : metric === "tax" ? "Total tax" : "Take-home"}
              countrySlug={country.urlSlug}
              pinnedIds={pins}
              onTogglePin={togglePin}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <CompareBar
        pinnedNames={pins
          .map((id) => regionValues.find((r) => r.jurisdictionId === id))
          .filter((r): r is MapRegionValue => r !== undefined)
          .map((r) => ({ id: r.jurisdictionId, name: r.name }))}
        onRemove={togglePin}
        onClear={() => {
          setPins([]);
          syncUrl({ pins: undefined });
        }}
        onCompare={() => {
          const [a, b] = [...pins].sort();
          if (a && b) router.push(`/compare/${a}/${b}?income=${Math.round(income)}`);
        }}
      />
    </div>
  );
}
