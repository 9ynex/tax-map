"use client";

import * as React from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUiStore } from "@/store/ui-store";

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
  regions,
  onSelect,
}: {
  topologyUrl: string;
  objectName: string;
  projection: "geoMercator" | "geoAlbersUsa";
  center: [number, number];
  scale: number;
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

  return (
    <TooltipProvider delayDuration={100}>
      <div className="w-full overflow-hidden rounded-2xl border border-border bg-surface">
        <ComposableMap
          projection={projection}
          projectionConfig={{ center, scale }}
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
