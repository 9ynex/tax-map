import { loadSnapshotChain } from "../data/snapshots";
import { computeTaxFromChain, type ComputeTaxInput, type TaxBreakdown } from "./computeTaxFromChain";

export type { ComputeTaxInput, ComponentResult, TaxBreakdown } from "./computeTaxFromChain";
export { computeTaxFromChain } from "./computeTaxFromChain";

/**
 * Server-only wrapper around `computeTaxFromChain` that loads the snapshot
 * chain from disk (node:fs, via the data layer) before computing. Keep this
 * file out of any client component's import graph — it's the reason
 * `computeTaxFromChain.ts` exists as a separate, fs-free module (see its
 * top-of-file comment).
 */
export function computeTax(input: ComputeTaxInput): TaxBreakdown {
  const snapshots = loadSnapshotChain(input.jurisdictionId, input.taxYear);
  return computeTaxFromChain(snapshots, input);
}
