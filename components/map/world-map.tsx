"use client";

import * as React from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUiStore } from "@/store/ui-store";

export interface WorldCountryValue {
  countrySlug: string;
  name: string;
  value: number;
  color: string;
  formattedValue: string;
}

const TOPOLOGY_URL = "/maps/world-countries.json";
const PROJECTION = "geoEqualEarth";
// Fit computed against public/maps/world-countries.json for an 800x600
// viewBox — center nudged east of true [0,0] so the bounds land roughly
// symmetric in the canvas rather than clipping the Pacific/east-Asia edge.
const CENTER: [number, number] = [10, 0];
const SCALE = 155.9;

/**
 * The site root's world-level map (docs/frontend.md decision: world map as
 * the new "/"). Every country outline renders for geographic context, but
 * only countries with a matching entry in `countries` (i.e. enabled in the
 * registry) are colored/interactive — everything else is a muted, inert
 * backdrop. This is deliberately a separate component from TaxMap rather
 * than a mode flag on it: the "most countries are non-interactive context,
 * not data" rendering differs enough (no tooltip, no hover, no click, flat
 * muted fill) that overloading TaxMap's per-region model would be more
 * conditional branching than reuse.
 */
export function WorldMap({
  countries,
  onSelect,
}: {
  countries: WorldCountryValue[];
  onSelect: (countrySlug: string) => void;
}) {
  const hovered = useUiStore((s) => s.hoveredJurisdictionId);
  const setHovered = useUiStore((s) => s.setHovered);

  const bySlug = React.useMemo(() => {
    const map = new Map<string, WorldCountryValue>();
    for (const country of countries) map.set(country.countrySlug, country);
    return map;
  }, [countries]);

  return (
    <TooltipProvider delayDuration={100}>
      <div className="w-full overflow-hidden rounded-2xl border border-border bg-surface">
        <ComposableMap
          projection={PROJECTION}
          projectionConfig={{ center: CENTER, scale: SCALE }}
          className="h-auto w-full"
        >
          <Geographies geography={TOPOLOGY_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const country = bySlug.get(geo.properties.slug as string);

                if (!country) {
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      style={{
                        default: {
                          fill: "var(--surface-raised)",
                          stroke: "var(--background)",
                          strokeWidth: 0.5,
                          outline: "none",
                        },
                        hover: {
                          fill: "var(--surface-raised)",
                          stroke: "var(--background)",
                          strokeWidth: 0.5,
                          outline: "none",
                        },
                        pressed: {
                          fill: "var(--surface-raised)",
                          stroke: "var(--background)",
                          strokeWidth: 0.5,
                          outline: "none",
                        },
                      }}
                    />
                  );
                }

                const isHovered = hovered === country.countrySlug;
                return (
                  <Tooltip key={geo.rsmKey}>
                    <TooltipTrigger asChild>
                      <Geography
                        geography={geo}
                        onMouseEnter={() => setHovered(country.countrySlug)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => onSelect(country.countrySlug)}
                        tabIndex={0}
                        role="button"
                        aria-label={`${country.name}: ${country.formattedValue}`}
                        style={{
                          default: {
                            fill: country.color,
                            stroke: "var(--background)",
                            strokeWidth: 0.75,
                            outline: "none",
                            transition: "fill 200ms, opacity 200ms",
                          },
                          hover: {
                            fill: country.color,
                            stroke: "var(--foreground)",
                            strokeWidth: 1.25,
                            outline: "none",
                            cursor: "pointer",
                          },
                          pressed: {
                            fill: country.color,
                            stroke: "var(--foreground)",
                            strokeWidth: 1.25,
                            outline: "none",
                          },
                        }}
                        opacity={isHovered || hovered === null ? 1 : 0.55}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-semibold text-foreground">{country.name}</p>
                      <p className="text-muted">{country.formattedValue}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })
            }
          </Geographies>
        </ComposableMap>
      </div>
    </TooltipProvider>
  );
}
