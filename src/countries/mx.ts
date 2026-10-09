import type { CountryConfig } from "./types";

export const mx: CountryConfig = {
  countryCode: "MX",
  urlSlug: "mx",
  name: "Mexico",
  rootJurisdictionId: "mx",
  currency: "MXN",
  currencySymbol: "$",
  taxYear: 2026,
  // ISR has no filing-status concept — Mexico taxes individuals regardless
  // of marital status, same shape as Canada. See data/README.md.
  usesFilingStatus: false,
  // Rough placeholder, not sourced against INEGI/ENOE income data — refine
  // before this claims any precision, same caveat as ca.ts's defaultIncome.
  defaultIncome: 150000,
  curatedIncomeLevels: [100000, 150000, 250000, 500000, 1000000],
  map: {
    topologyUrl: "/maps/mx-states.json",
    objectName: "states",
    projection: "geoMercator",
    // Fit computed against public/maps/mx-states.json for an 800x600
    // viewBox with geoMercator (bbox: lon -118.37..-86.72, lat 14.53..32.72).
    center: [-102, 23],
    scale: 1270,
  },
  enabled: true,
};
