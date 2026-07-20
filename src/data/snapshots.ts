import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { TaxYearSnapshotSchema, type TaxYearSnapshot } from "./schema";
import { DATA_ROOT, getAncestors } from "./registry";

// docs/data.md: past tax years are immutable, so caching them for the lifetime
// of the process is always safe. The current/in-progress year is cached too —
// a fresh deploy (new process) is what picks up a data update, per the annual
// PR-based workflow in docs/deployment.md, not a runtime TTL.
const snapshotCache = new Map<string, TaxYearSnapshot | null>();

/** Clears the in-memory registry/snapshot caches. Test-only. */
export function _resetSnapshotCache(): void {
  snapshotCache.clear();
}

function snapshotPath(jurisdictionId: string, taxYear: number): string {
  const slugs = getAncestors(jurisdictionId).map((j) => j.slug);
  return path.join(DATA_ROOT, ...slugs, `${taxYear}.json`);
}

/**
 * Loads the TaxYearSnapshot for a single jurisdiction (not its ancestors).
 * Returns null if no snapshot exists for that jurisdiction/year — e.g. a
 * municipality with no data yet, per the tiered coverage in docs/data.md.
 */
export function loadSnapshot(jurisdictionId: string, taxYear: number): TaxYearSnapshot | null {
  const cacheKey = `${jurisdictionId}:${taxYear}`;
  const cached = snapshotCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const filePath = snapshotPath(jurisdictionId, taxYear);
  if (!existsSync(filePath)) {
    snapshotCache.set(cacheKey, null);
    return null;
  }

  const raw = readFileSync(filePath, "utf-8");
  const snapshot = TaxYearSnapshotSchema.parse(JSON.parse(raw));

  if (snapshot.jurisdictionId !== jurisdictionId || snapshot.taxYear !== taxYear) {
    throw new Error(
      `snapshot at ${filePath} declares jurisdictionId="${snapshot.jurisdictionId}" ` +
        `taxYear=${snapshot.taxYear}, expected "${jurisdictionId}"/${taxYear}`,
    );
  }

  snapshotCache.set(cacheKey, snapshot);
  return snapshot;
}

/**
 * Loads every snapshot from the country root down to the given jurisdiction
 * for a tax year — e.g. loadSnapshotChain("us-ca", 2026) returns [US federal,
 * California state], each with whatever TaxComponents apply at that level.
 * This is the input a calculation engine sums over; it does no tax math itself.
 */
export function loadSnapshotChain(jurisdictionId: string, taxYear: number): TaxYearSnapshot[] {
  return getAncestors(jurisdictionId)
    .map((j) => loadSnapshot(j.id, taxYear))
    .filter((s): s is TaxYearSnapshot => s !== null);
}
