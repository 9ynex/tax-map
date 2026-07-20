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

/**
 * Sums a TaxComponent's deductions and credits against a taxable base,
 * resolving filing-status-conditional amounts and phase-outs. Throws if an
 * amount needs a filing status that wasn't supplied, rather than silently
 * treating it as zero.
 */
export function resolveDeductionsAndCredits(
  deductionsCredits: DeductionOrCredit[] | undefined,
  base: number,
  filingStatus: FilingStatus | undefined,
  context: string,
): DeductionCreditTotals {
  let deductions = 0;
  let credits = 0;

  for (const dc of deductionsCredits ?? []) {
    const resolved = resolveAmount(dc.amount, filingStatus);
    if (resolved === undefined) {
      throw new Error(
        `${context}: "${dc.name}" (${dc.kind}) requires a filingStatus to resolve its amount`,
      );
    }
    const applied = applyPhaseOut(resolved, dc.phaseOut, base);
    if (dc.kind === "deduction") deductions += applied;
    else credits += applied;
  }

  return { deductions, credits };
}
