"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
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
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [highlighted, setHighlighted] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const candidates = React.useMemo(
    () => allRegions.filter((r) => r.jurisdictionId !== currentRegion.jurisdictionId),
    [allRegions, currentRegion.jurisdictionId],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (r) => r.name.toLowerCase().includes(q) || r.countryName.toLowerCase().includes(q),
    );
  }, [candidates, query]);

  const grouped = React.useMemo(() => {
    const groups = new Map<string, ComparableRegion[]>();
    for (const r of filtered) {
      const list = groups.get(r.countryName) ?? [];
      list.push(r);
      groups.set(r.countryName, list);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  React.useEffect(() => {
    setHighlighted(0);
  }, [filtered]);

  const select = React.useCallback(
    (region: ComparableRegion) => {
      const [a, b] = canonicalPair(currentRegion.jurisdictionId, region.jurisdictionId);
      setOpen(false);
      setQuery("");
      router.push(`/compare/${a}/${b}?income=${Math.round(income)}`);
    },
    [currentRegion.jurisdictionId, income, router],
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <ArrowLeftRight className="h-4 w-4" />
          Compare with another region
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlighted((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const region = filtered[highlighted];
                if (region) select(region);
              }
            }}
            placeholder="Search regions…"
            aria-label="Search regions to compare"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
          />
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-muted">No regions found.</p>
          )}
          {grouped.map(([countryName, regions]) => (
            <div key={countryName}>
              <div className="px-3 pt-2 pb-1 text-xs font-medium text-muted">{countryName}</div>
              {regions.map((region) => {
                const index = filtered.indexOf(region);
                return (
                  <button
                    key={region.jurisdictionId}
                    type="button"
                    onClick={() => select(region)}
                    onMouseEnter={() => setHighlighted(index)}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-foreground",
                      index === highlighted && "bg-accent/15",
                    )}
                  >
                    {region.name}
                    <span className="text-xs text-muted">{region.currency}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
