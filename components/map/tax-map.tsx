"use client";

import * as React from "react";
import { ComposableMap, Geographies, Geography, type ProjectionFunction } from "react-simple-maps";
import { geoConicConformalFrance } from "d3-composite-projections";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUiStore } from "@/store/ui-store";

/**
 * Composite projections (currently just France's overseas régions inset)
 * aren't plain d3-geo export names react-simple-maps can resolve by string —
 * they're fully self-contained GeoProjection objects with their own baked-in
 * scale/translate/rotate that must be passed through as-is. react-simple-maps
 * detects this automatically (its internal `makeProjection` short-circuits
 * to `return projection` whenever `typeof projection === "function"`, a d3
 * projection always being callable — see node_modules/react-simple-maps's
 * MapProvider), skipping projectionConfig entirely, which is why `center`/
 * `scale` are meaningless for these and go unused below.
 *
 * The cast below is necessary, not just convenient: @types/react-simple-maps
 * declares `ProjectionFunction` as `(width, height, config) => GeoProjection`
 * (a *factory*) to match its own named-string resolution path, but a real d3
 * GeoProjection object — what `geoConicConformalFrance()` actually returns —
 * has the unrelated call signature `(point) => [number, number] | null`. Both
 * are "just functions" at runtime (which is all `isFunc` in MapProvider ever
 * checks), so the mismatch is only a typing gap in @types/react-simple-maps,
 * not a real runtime incompatibility.
 */
function resolveProjection(name: string): string | ProjectionFunction {
  if (name === "geoConicConformalFrance") {
    return geoConicConformalFrance() as unknown as ProjectionFunction;
  }
  return name;
}

export interface MapRegionValue {
  jurisdictionId: string;
  slug: string;
  name: string;
  value: number;
  color: string;
  formattedValue: string;
}

export function TaxMap({
  topologyUrl,
  objectName,
  projection,
  center,
  scale,
  width = 800,
  height = 600,
  regions,
  onSelect,
}: {
  topologyUrl: string;
  objectName: string;
  projection: "geoMercator" | "geoAlbersUsa" | "geoConicConformalFrance";
  center?: [number, number];
  scale?: number;
  width?: number;
  height?: number;
  regions: MapRegionValue[];
  onSelect: (jurisdictionId: string) => void;
}) {
  const hovered = useUiStore((s) => s.hoveredJurisdictionId);
  const setHovered = useUiStore((s) => s.setHovered);

  const bySlug = React.useMemo(() => {
    const map = new Map<string, MapRegionValue>();
    for (const region of regions) map.set(region.slug, region);
    return map;
  }, [regions]);

  const resolvedProjection = React.useMemo(() => resolveProjection(projection), [projection]);

  return (
    <TooltipProvider delayDuration={100}>
      <div className="w-full overflow-hidden rounded-2xl border border-border bg-surface">
        <ComposableMap
          projection={resolvedProjection}
          projectionConfig={{ center, scale }}
          width={width}
          height={height}
          className="h-auto w-full"
        >
          <Geographies geography={topologyUrl}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const region = bySlug.get(geo.properties.slug as string);
                if (!region) return null;
                const isHovered = hovered === region.jurisdictionId;
                return (
                  <Tooltip key={geo.rsmKey}>
                    <TooltipTrigger asChild>
                      <Geography
                        geography={geo}
                        onMouseEnter={() => setHovered(region.jurisdictionId)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => onSelect(region.jurisdictionId)}
                        tabIndex={0}
                        role="button"
                        aria-label={`${region.name}: ${region.formattedValue}`}
                        style={{
                          default: {
                            fill: region.color,
                            stroke: "var(--background)",
                            strokeWidth: 0.75,
                            outline: "none",
                            transition: "fill 200ms, opacity 200ms",
                          },
                          hover: {
                            fill: region.color,
                            stroke: "var(--foreground)",
                            strokeWidth: 1.25,
                            outline: "none",
                            cursor: "pointer",
                          },
                          pressed: {
                            fill: region.color,
                            stroke: "var(--foreground)",
                            strokeWidth: 1.25,
                            outline: "none",
                          },
                        }}
                        opacity={isHovered || hovered === null ? 1 : 0.55}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-semibold text-foreground">{region.name}</p>
                      <p className="text-muted">{region.formattedValue}</p>
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
