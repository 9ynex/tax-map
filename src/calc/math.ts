import { resolveAmount } from "../data/filingStatus";
import type { DeductionOrCredit, FilingStatus, TaxBracket } from "../data/schema";

/** Progressive bracket tax on a taxable base. Brackets must be sorted ascending by min. */
export function taxFromBrackets(base: number, brackets: TaxBracket[]): number {
  let tax = 0;
  for (const bracket of brackets) {
    if (base <= bracket.min) continue;
    const upper = bracket.max ?? Infinity;
    const amountInBracket = Math.min(base, upper) - bracket.min;
    if (amountInBracket > 0) tax += amountInBracket * bracket.rate;
  }
  return tax;
}

/**
 * Applies a phase-out to a deduction/credit amount: full value at or below
 * `start`, linearly reduced to zero between `start` and `end`, zero beyond
 * `end`. This is a simplified linear model — real-world phase-outs (e.g. the
 * US Child Tax Credit) sometimes step down at a fixed rate per dollar rather
 * than reaching exactly zero at a known endpoint; revisit if a jurisdiction
 * needs that distinction.
 */
export function applyPhaseOut(
  amount: number,
  phaseOut: { start: number; end: number } | undefined,
  base: number,
): number {
  if (!phaseOut) return amount;
  const { start, end } = phaseOut;
  if (base >= end) return 0;
  if (base <= start) return amount;
  return amount * (1 - (base - start) / (end - start));
}

export interface DeductionCreditTotals {
  deductions: number;
  credits: number;
}

/** Looks up the flat amount for whichever tier `base` falls into. */
function resolveSteppedAmount(base: number, tiers: { upTo: number | null; amount: number }[]): number {
  for (const tier of tiers) {
    if (tier.upTo === null || base <= tier.upTo) return tier.amount;
  }
  return tiers[tiers.length - 1]!.amount;
}

/**
 * Sums a TaxComponent's deductions and credits against a taxable base,
 * resolving filing-status-conditional amounts and phase-outs. Throws if an
 * amount needs a filing status that wasn't supplied, rather than silently
 * treating it as zero.
 *
 * `bracketedAmount`/`steppedAmount` entries (see schema.ts) are looked up
 * against a *running* base that shrinks by each prior deduction-kind
 * entry's resolved amount, in array order — e.g. Japan's 基礎控除 tiers are
 * defined against income *after* 給与所得控除, not gross income, so
 * 給与所得控除 must be listed first. Plain `amount` entries are unaffected
 * and keep resolving (and phasing out) against the original `base` exactly
 * as before, so every existing country's behavior is unchanged.
 */
export function resolveDeductionsAndCredits(
  deductionsCredits: DeductionOrCredit[] | undefined,
  base: number,
  filingStatus: FilingStatus | undefined,
  context: string,
): DeductionCreditTotals {
  let deductions = 0;
  let credits = 0;
  let runningBase = base;

  for (const dc of deductionsCredits ?? []) {
    let resolved: number;
    let lookupBase = base;

    if (dc.bracketedAmount) {
      resolved = taxFromBrackets(runningBase, dc.bracketedAmount);
      lookupBase = runningBase;
    } else if (dc.steppedAmount) {
      resolved = resolveSteppedAmount(runningBase, dc.steppedAmount);
      lookupBase = runningBase;
    } else {
      // The schema's refine() guarantees exactly one of amount/
      // bracketedAmount/steppedAmount is set; neither of the latter two
      // matched above, so amount must be defined here.
      const amount = resolveAmount(dc.amount!, filingStatus);
      if (amount === undefined) {
        throw new Error(
          `${context}: "${dc.name}" (${dc.kind}) requires a filingStatus to resolve its amount`,
        );
      }
      resolved = amount;
    }

    const applied = applyPhaseOut(resolved, dc.phaseOut, lookupBase);
    if (dc.kind === "deduction") {
      deductions += applied;
      runningBase = Math.max(0, runningBase - applied);
    } else {
      credits += applied;
    }
  }

  return { deductions, credits };
}
