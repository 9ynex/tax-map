import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ExchangeRateSnapshotSchema, type ExchangeRateSnapshot } from "./schema";
import { DATA_ROOT } from "./registry";

// Same caching rationale as snapshots.ts: a static, committed-to-the-repo
// file, refreshed by a data-update pass (not a live API call), so caching
// for the process lifetime is always safe.
const exchangeRateCache = new Map<number, ExchangeRateSnapshot | null>();

/** Clears the in-memory exchange-rate cache. Test-only. */
export function _resetExchangeRateCache(): void {
  exchangeRateCache.clear();
}

/**
 * Loads the ExchangeRateSnapshot (IMF WEO Implied PPP conversion rates —
 * see schema.ts) for a given year. Returns null if no snapshot exists for
 * that year, the same "missing data is null, not an error" convention
 * loadSnapshot uses — a caller converting currencies should decide for
 * itself whether a missing year is fatal or a reason to fall back to an
 * unconverted comparison (see components/breakdown/compare-view.tsx).
 */
export function loadExchangeRates(year: number): ExchangeRateSnapshot | null {
  const cached = exchangeRateCache.get(year);
  if (cached !== undefined) return cached;

  const filePath = path.join(DATA_ROOT, "exchange-rates", `${year}.json`);
  if (!existsSync(filePath)) {
    exchangeRateCache.set(year, null);
    return null;
  }

  const raw = readFileSync(filePath, "utf-8");
  const snapshot = ExchangeRateSnapshotSchema.parse(JSON.parse(raw));

  if (snapshot.year !== year) {
    throw new Error(
      `exchange rate snapshot at ${filePath} declares year=${snapshot.year}, expected ${year}`,
    );
  }

  exchangeRateCache.set(year, snapshot);
  return snapshot;
}
