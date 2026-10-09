import type { ExchangeRateSnapshot } from "../data/schema";

/**
 * Converts an amount from one currency to another using an
 * ExchangeRateSnapshot's PPP-basis rates (see src/data/schema.ts). Pure and
 * fs-free, so it's safe to import into a client component — the snapshot
 * itself is loaded server-side (src/data/exchangeRates.ts) and passed down
 * as a plain prop, the same "load once on the server, recompute freely on
 * the client" pattern computeTaxFromChain already uses for tax snapshots.
 *
 * Converting via the shared "international dollar" basis (amount / fromRate
 * gives international dollars, then x toRate converts to the target
 * currency) rather than a direct pairwise rate keeps this correct for any
 * currency pair without needing every pair precomputed.
 */
export function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: ExchangeRateSnapshot,
): number {
  if (fromCurrency === toCurrency) return amount;

  const fromRate = rates.rates[fromCurrency];
  if (fromRate === undefined) {
    throw new Error(`no exchange rate for currency "${fromCurrency}" in ${rates.year} snapshot`);
  }
  const toRate = rates.rates[toCurrency];
  if (toRate === undefined) {
    throw new Error(`no exchange rate for currency "${toCurrency}" in ${rates.year} snapshot`);
  }

  const internationalDollars = amount / fromRate;
  return internationalDollars * toRate;
}
