import type { CountryConfig } from "./types";

export const us: CountryConfig = {
  countryCode: "US",
  urlSlug: "us",
  name: "United States",
  rootJurisdictionId: "us",
  currency: "USD",
  currencySymbol: "$",
  taxYear: 2026,
  usesFilingStatus: true,
  defaultFilingStatus: "single",
  defaultIncome: 65000,
  curatedIncomeLevels: [50000, 75000, 100000, 150000, 200000],
  map: {
    topologyUrl: "/maps/us-states.json",
    objectName: "states",
    projection: "geoAlbersUsa",
    // Unused by geoAlbersUsa (no .center()) — see types.ts. Kept as a
    // plausible value rather than a dummy in case a future projection
    // swap needs it.
    center: [-98, 38],
    // Fit computed against public/maps/us-states.json for an 800x600
    // viewBox: bounds land at x:[5,765] y:[74,533], comfortably centered
    // with padding on all sides.
    scale: 1011.5,
  },
  enabled: true,
};
