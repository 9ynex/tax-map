import type { CountryConfig } from "./types";

export const fr: CountryConfig = {
  countryCode: "FR",
  urlSlug: "fr",
  name: "France",
  rootJurisdictionId: "fr",
  currency: "EUR",
  currencySymbol: "€",
  taxYear: 2026,
  // L'impôt sur le revenu is computed per "part" of the quotient familial
  // (1 for a single person, 2 for a married couple, +0.5 per dependent,
  // etc.), not by a small fixed set of filing statuses — that system has no
  // clean mapping onto FilingStatus's US-shaped enum, so this models a
  // single taxpayer at 1 part, same simplification as excluding household
  // composition everywhere else in this app. See data/README.md.
  usesFilingStatus: false,
  // Rough placeholder, not sourced against INSEE salary-distribution data —
  // refine before this claims any precision, same caveat as ca.ts's
  // defaultIncome.
  defaultIncome: 35000,
  curatedIncomeLevels: [20000, 30000, 45000, 70000, 100000, 150000],
  map: {
    topologyUrl: "/maps/fr-regions.json",
    objectName: "regions",
    // France's 5 overseas régions (Guadeloupe, Martinique, Guyane, Réunion,
    // Mayotte) are genuinely thousands of km from mainland France — a plain
    // projection would either crop them or force the mainland to an
    // unusably tiny scale, so this uses the same composite-projection
    // approach as "geoAlbersUsa" for Alaska/Hawaii, via the
    // d3-composite-projections package (resolved in tax-map.tsx, not by
    // react-simple-maps itself — see its comment there).
    projection: "geoConicConformalFrance",
    // center/scale are meaningless here — geoConicConformalFrance() is a
    // fully self-contained, pre-scaled/pre-translated projection. width/
    // height matter instead: the projection is "configured by default for
    // 960×500" per its own source, so the ComposableMap frame must match.
    width: 960,
    height: 500,
  },
  enabled: true,
};
