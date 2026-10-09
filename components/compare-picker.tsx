"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import type { ComparableRegion } from "@/src/countries/listAllRegions";

/** Canonicalize comparison direction — mirrors app/compare/[a]/[b]/page.tsx's canonicalPair. */
function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Searchable, cross-country region picker for "Compare with another
 * region" — replaces the old pin-a-region-on-the-map-then-pin-a-second-one
 * flow with a direct picker so any two regions (including across
 * countries) are one search + selection away. Currency mismatches are
 * allowed through (the user's own call) — see docs/data.md's comparison
 * scope note and app/compare/[a]/[b]/page.tsx for how the destination page
 * presents a cross-currency pair (rate-based comparison, each side's
 * dollar figures kept in their own currency, no conversion).
 */
export function ComparePicker({
  currentRegion,
  allRegions,
  income,
}: {
  currentRegion: { jurisdictionId: string; name: string };
  allRegions: ComparableRegion[];
  income: number;
}) {
  const router = useRouter();

  const items: ComboboxItem[] = React.useMemo(
    () =>
      allRegions
        .filter((r) => r.jurisdictionId !== currentRegion.jurisdictionId)
        .map((r) => ({ id: r.jurisdictionId, label: r.name, group: r.countryName, meta: r.currency })),
    [allRegions, currentRegion.jurisdictionId],
  );

  const select = React.useCallback(
    (item: ComboboxItem) => {
      const [a, b] = canonicalPair(currentRegion.jurisdictionId, item.id);
      router.push(`/compare/${a}/${b}?income=${Math.round(income)}`);
    },
    [currentRegion.jurisdictionId, income, router],
  );

  return (
    <Combobox
      items={items}
      onSelect={select}
      placeholder="Search regions…"
      ariaLabel="Search regions to compare"
      trigger={
        <Button variant="outline" size="sm">
          <ArrowLeftRight className="h-4 w-4" />
          Compare with another region
        </Button>
      }
    />
  );
}
