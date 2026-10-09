// Public surface of the data service layer described in docs/data.md.
// This layer loads, validates, and serves jurisdiction + tax-year data.
// It intentionally does no tax computation — see ../calc/computeTax.ts for
// the calculation engine that consumes this layer.

export {
  getJurisdiction,
  getChildren,
  getAncestors,
  listJurisdictions,
} from "./registry";

export { loadSnapshot, loadSnapshotChain } from "./snapshots";

export { loadExchangeRates } from "./exchangeRates";

export {
  resolveBracketSet,
  requiresFilingStatus,
  resolveAmount,
  amountRequiresFilingStatus,
} from "./filingStatus";

export type {
  CountryCode,
  Jurisdiction,
  JurisdictionLevel,
  FilingStatus,
  TaxBracket,
  DeductionOrCredit,
  DeductionOrCreditKind,
  TaxComponentType,
  Precision,
  TaxComponent,
  TaxYearSnapshot,
  ExchangeRateBasis,
  ExchangeRateSnapshot,
} from "./schema";
