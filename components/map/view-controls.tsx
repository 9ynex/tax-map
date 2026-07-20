"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { MapMetric, ViewMode } from "@/lib/url-state";

const METRIC_LABELS: Record<MapMetric, string> = {
  rate: "Effective rate",
  tax: "Total tax",
  net: "Take-home",
};

export function MetricToggle({
  value,
  onChange,
}: {
  value: MapMetric;
  onChange: (value: MapMetric) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as MapMetric)}
      aria-label="Color map by"
    >
      {(Object.keys(METRIC_LABELS) as MapMetric[]).map((metric) => (
        <ToggleGroupItem key={metric} value={metric}>
          {METRIC_LABELS[metric]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as ViewMode)}
      aria-label="View mode"
    >
      <ToggleGroupItem value="map">Map</ToggleGroupItem>
      <ToggleGroupItem value="list">List</ToggleGroupItem>
    </ToggleGroup>
  );
}
