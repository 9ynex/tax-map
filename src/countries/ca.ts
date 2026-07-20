import type { CountryConfig } from "./types";

export const ca: CountryConfig = {
  countryCode: "CA",
  urlSlug: "ca",
  name: "Canada",
  rootJurisdictionId: "ca",
  currency: "CAD",
  currencySymbol: "$",
  taxYear: 2026,
  usesFilingStatus: false,
  // Approximate national median individual income — refine against a StatCan
  // source before this claims any precision; it's only a starting point for
  // the default (unbookmarked) view, per docs/frontend.md #2.
  defaultIncome: 55000,
  curatedIncomeLevels: [40000, 55000, 75000, 100000, 150000, 200000],
  map: {
    topologyUrl: "/maps/ca-provinces.json",
    objectName: "provinces",
    projection: "geoMercator",
    // Fit computed against public/maps/ca-provinces.json for an 800x600
    // viewBox with geoMercator (see components/map/tax-map.tsx) — biased
    // north of Canada's true geometric center so the populated south isn't
    // pushed to the bottom edge, while still keeping every province/
    // territory's mainland at least partially in the default view.
    center: [-96, 69],
    scale: 268.7,
  },
  enabled: true,
};
