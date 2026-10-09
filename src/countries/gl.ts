import type { CountryConfig } from "./types";

export const gl: CountryConfig = {
  countryCode: "GL",
  urlSlug: "gl",
  name: "Greenland",
  rootJurisdictionId: "gl",
  currency: "DKK",
  currencySymbol: "kr.",
  taxYear: 2026,
  // Greenland's income tax has no filing-status concept — like Canada and
  // Mexico, individuals are taxed regardless of marital status. See
  // data/README.md.
  usesFilingStatus: false,
  // Rough placeholder, not sourced against Statistics Greenland (stat.gl)
  // wage data — refine before this claims any precision, same caveat as
  // ca.ts's defaultIncome. DKK amounts are naturally larger-numbered than
  // USD/EUR/GBP for a comparable real income.
  defaultIncome: 350000,
  curatedIncomeLevels: [200000, 300000, 400000, 550000, 700000, 900000],
  map: {
    topologyUrl: "/maps/gl-municipalities.json",
    objectName: "municipalities",
    projection: "geoMercator",
    // Fit computed against public/maps/gl-municipalities.json for an
    // 800x600 viewBox with geoMercator (bbox: lon -72.82..-21.52,
    // lat 59.98..81.21 — Greenland's high latitude means real, unavoidable
    // Mercator stretching near the top of the map, not a fit error).
    center: [-47, 73.7],
    scale: 416,
  },
  enabled: true,
};
