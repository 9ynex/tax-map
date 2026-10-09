import type { CountryConfig } from "./types";

export const br: CountryConfig = {
  countryCode: "BR",
  urlSlug: "br",
  name: "Brazil",
  rootJurisdictionId: "br",
  currency: "BRL",
  currencySymbol: "R$",
  taxYear: 2026,
  // IRPF has no filing-status concept — like Canada and Mexico, Brazil
  // taxes individuals regardless of marital status (household adjustments
  // happen through per-dependent deductions this app excludes everywhere).
  // See data/README.md.
  usesFilingStatus: false,
  // Rough placeholder, not sourced against IBGE wage-distribution data —
  // refine before this claims any precision, same caveat as ca.ts's
  // defaultIncome. Deliberately inside the Lei 15.270/25 phase-out band
  // (R$60,000–84,000) so the default view shows the new reform doing
  // something, not just full exemption or full taxation.
  defaultIncome: 72000,
  curatedIncomeLevels: [40000, 60000, 84000, 120000, 200000, 400000],
  map: {
    topologyUrl: "/maps/br-states.json",
    objectName: "states",
    projection: "geoMercator",
    // Fit computed against public/maps/br-states.json for an 800x600
    // viewBox with geoMercator (bbox: lon -74.03..-34.66, lat -33.73..5.17).
    center: [-54.3, -15.2],
    scale: 726,
  },
  enabled: true,
};
