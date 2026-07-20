"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Pin } from "lucide-react";

import type { MapRegionValue } from "@/components/map/tax-map";
import { cn } from "@/lib/utils";

/**
 * The crawlability/accessibility fallback (docs/seo.md #2, docs/frontend.md
 * #6-7): every region reachable via a real `<a href>` regardless of map
 * pan/zoom state, and the precision/power-user path (sortable by value).
 * Also the pinning entry point for comparison (docs/frontend.md #5) — the
 * pin button is a separate click target from the row link.
 */
export function RegionList({
  regions,
  onSelect,
  metricLabel,
  countrySlug,
  pinnedIds,
  onTogglePin,
}: {
  regions: MapRegionValue[];
  onSelect: (jurisdictionId: string) => void;
  metricLabel: string;
  countrySlug: string;
  pinnedIds: string[];
  onTogglePin: (jurisdictionId: string) => void;
}) {
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc");

  const sorted = React.useMemo(
    () =>
      [...regions].sort((a, b) => (direction === "desc" ? b.value - a.value : a.value - b.value)),
    [regions, direction],
  );

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setDirection((d) => (d === "desc" ? "asc" : "desc"))}
        className="flex w-full items-center justify-between border-b border-border px-5 py-3 text-left text-sm font-medium text-muted hover:text-foreground"
      >
        <span>Region</span>
        <span className="flex items-center gap-1">
          {metricLabel}
          {direction === "desc" ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
        </span>
      </button>
      <ul>
        {sorted.map((region) => {
          const isPinned = pinnedIds.includes(region.jurisdictionId);
          return (
            <li
              key={region.jurisdictionId}
              className="flex items-center border-b border-border last:border-b-0"
            >
              <button
                type="button"
                onClick={() => onTogglePin(region.jurisdictionId)}
                aria-pressed={isPinned}
                aria-label={isPinned ? `Unpin ${region.name}` : `Pin ${region.name} to compare`}
                className={cn(
                  "px-3 py-3 text-muted hover:text-foreground",
                  isPinned && "text-accent hover:text-accent",
                )}
              >
                <Pin className="h-4 w-4" fill={isPinned ? "currentColor" : "none"} />
              </button>
              <a
                href={`/${countrySlug}/${region.slug}`}
                onClick={(e) => {
                  e.preventDefault();
                  onSelect(region.jurisdictionId);
                }}
                className="flex flex-1 items-center justify-between py-3 pr-5 text-sm transition-colors hover:bg-surface-raised"
              >
                <span className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: region.color }}
                    aria-hidden
                  />
                  <span className="text-foreground">{region.name}</span>
                </span>
                <span className="font-mono tabular-nums text-muted">{region.formattedValue}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
