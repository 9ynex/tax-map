/**
 * Income, metric, view mode, and pinned regions all live in the URL, not
 * component state (docs/frontend.md: "URL is the source of truth for
 * income, country, and pinned regions"). This module is the one place that
 * knows the query-param names and their parsing/defaults, shared between
 * server components (reading the `searchParams` prop) and client components
 * (reading `useSearchParams()`).
 */

export type MapMetric = "rate" | "tax" | "net";
export type ViewMode = "map" | "list";

export const DEFAULT_METRIC: MapMetric = "rate";
export const DEFAULT_VIEW: ViewMode = "map";

export type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseIncome(params: SearchParams, fallback: number): number {
  const raw = first(params.income);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function parseMetric(params: SearchParams): MapMetric {
  const raw = first(params.metric);
  return raw === "tax" || raw === "net" ? raw : DEFAULT_METRIC;
}

export function parseView(params: SearchParams): ViewMode {
  const raw = first(params.view);
  return raw === "list" ? "list" : DEFAULT_VIEW;
}

/** Pinned jurisdiction ids for the "N selected — compare" bar (docs/frontend.md #5). */
export function parsePins(params: SearchParams): string[] {
  const raw = first(params.pins);
  return raw ? raw.split(",").filter(Boolean) : [];
}

/** Builds a query string from the current param set plus overrides, dropping keys equal to their default. */
export function buildQuery(
  current: SearchParams,
  overrides: Partial<Record<"income" | "metric" | "view" | "pins", string | undefined>>,
): string {
  const next = new URLSearchParams();
  const merged: SearchParams = { ...current, ...overrides };

  if (merged.income) next.set("income", String(first(merged.income)));
  if (merged.metric && merged.metric !== DEFAULT_METRIC) next.set("metric", String(first(merged.metric)));
  if (merged.view && merged.view !== DEFAULT_VIEW) next.set("view", String(first(merged.view)));
  if (merged.pins) next.set("pins", String(first(merged.pins)));

  const qs = next.toString();
  return qs ? `?${qs}` : "";
}
