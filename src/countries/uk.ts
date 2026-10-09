import type { CountryConfig } from "./types";

export const uk: CountryConfig = {
  countryCode: "GB",
  urlSlug: "uk",
  name: "United Kingdom",
  rootJurisdictionId: "uk",
  currency: "GBP",
  currencySymbol: "£",
  taxYear: 2026,
  // Income Tax has no filing-status concept — like Canada and Mexico, the UK
  // taxes individuals regardless of marital status. See data/README.md.
  usesFilingStatus: false,
  // Rough placeholder, not sourced against ONS/ASHE earnings data — refine
  // before this claims any precision, same caveat as ca.ts's defaultIncome.
  defaultIncome: 40000,
  curatedIncomeLevels: [20000, 30000, 50000, 75000, 100000, 150000],
  map: {
    topologyUrl: "/maps/uk-nations.json",
    objectName: "nations",
    projection: "geoMercator",
    // Fit computed against public/maps/uk-nations.json for an 800x600
    // viewBox with geoMercator (bbox: lon -8.18..1.76, lat 49.96..60.85).
    center: [-3.2, 55.8],
    scale: 1540,
  },
  enabled: true,
};
