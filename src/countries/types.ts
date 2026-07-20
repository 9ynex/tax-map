import type { CountryCode, FilingStatus } from "../data/schema";

/**
 * UI-layer config for one country: which countries the frontend exposes,
 * and the country-specific bits a generic page/component needs (map asset,
 * default income, currency display) that don't belong in the data schema
 * itself (docs/data.md's Jurisdiction/TaxComponent model has none of this —
 * it's presentation, not tax data).
 *
 * Adding a country later means adding one CountryConfig entry to the
 * registry, not touching route or component code — see docs/data.md's
 * "Extensibility" section and src/countries/registry.ts.
 */
export interface CountryConfig {
  countryCode: CountryCode;
  /** Lowercase URL segment, e.g. "ca" for /ca/on. Usually countryCode.toLowerCase(). */
  urlSlug: string;
  name: string;
  /** The root (level: "country") jurisdiction id in data/jurisdictions.json. */
  rootJurisdictionId: string;
  currency: string;
  currencySymbol: string;
  taxYear: number;
  /** Whether this country's income-tax brackets vary by filing status (docs/data.md — not universal). */
  usesFilingStatus: boolean;
  /**
   * Filing status used for map/list/default-view computation when
   * `usesFilingStatus` is true — required for any calculation, but
   * frontend.md #8 says filing status is a secondary input, not part of
   * the primary income/country flow, so a sane default ("single", the
   * most common baseline) is what every non-drilled-in view uses. Leave
   * unset for countries where `usesFilingStatus` is false.
   */
  defaultFilingStatus?: FilingStatus;
  /** Sensible default income for the root "/" and "/{country}" pages (docs/frontend.md #2). */
  defaultIncome: number;
  /** Curated income levels statically generated per docs/seo.md #4 — arbitrary slider values stay client-only. */
  curatedIncomeLevels: number[];
  map: {
    /** Path under /public to a TopoJSON FeatureCollection of this country's regions. */
    topologyUrl: string;
    /** Name of the object within the TopoJSON's `objects` map. */
    objectName: string;
    /**
     * Any d3-geo projection export name (react-simple-maps resolves it by
     * that string directly). "geoAlbersUsa" is the standard composite
     * projection for the US — it insets Alaska/Hawaii near the lower 48
     * instead of leaving them at their true, far-flung coordinates, which
     * is what keeps every state comfortably tappable at a sane zoom level
     * (docs/frontend.md #6). A plain single-piece country (Canada) just
     * uses an ordinary projection like "geoMercator".
     */
    projection: "geoMercator" | "geoAlbersUsa";
    /**
     * [longitude, latitude] map center for the default zoomed-in view
     * (docs/frontend.md #6). Ignored by composite projections like
     * "geoAlbersUsa", which have no `.center()` — react-simple-maps simply
     * never calls it for those, so this is only meaningful for
     * "geoMercator"-style countries.
     */
    center: [number, number];
    scale: number;
  };
  /** Whether this country is exposed in the UI yet — lets a country's data/config land ahead of its launch. */
  enabled: boolean;
}
