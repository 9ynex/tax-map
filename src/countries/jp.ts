import type { CountryConfig } from "./types";

export const jp: CountryConfig = {
  countryCode: "JP",
  urlSlug: "jp",
  name: "Japan",
  rootJurisdictionId: "jp",
  currency: "JPY",
  currencySymbol: "¥",
  taxYear: 2026,
  // 所得税/住民税 have no filing-status concept in the sense this app models
  // it — Japan's household adjustment happens through per-dependent
  // deductions (配偶者控除, 扶養控除), not a small fixed set of statuses,
  // and this app excludes dependent/household-composition amounts
  // everywhere. See data/README.md.
  usesFilingStatus: false,
  // Rough placeholder, not sourced against MHLW/e-Stat wage-distribution
  // data — refine before this claims any precision, same caveat as
  // ca.ts's defaultIncome. JPY amounts are naturally ~100x USD-scale.
  defaultIncome: 5000000,
  curatedIncomeLevels: [3000000, 4500000, 6000000, 9000000, 12000000, 20000000],
  map: {
    topologyUrl: "/maps/jp-prefectures.json",
    objectName: "prefectures",
    projection: "geoMercator",
    // Fit computed against public/maps/jp-prefectures.json for an 800x600
    // viewBox with geoMercator (bbox: lon 122.94..148.90, lat 24.04..45.56).
    center: [136, 35.5],
    scale: 1124,
  },
  enabled: true,
};
