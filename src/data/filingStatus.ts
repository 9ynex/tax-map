import type { FilingStatus, TaxBracket, TaxComponent } from "./schema";

/**
 * Resolves a TaxComponent's brackets to a single flat set, given an optional
 * filing status. Brackets are either a flat array (jurisdiction has no filing
 * status concept, e.g. Canada federally) or a record keyed by filing status
 * (e.g. US federal/state) — see docs/data.md. Returns undefined if the
 * component has no brackets (flatRate-only, e.g. sales tax) or if filing
 * status was required to disambiguate but wasn't provided.
 */
export function resolveBracketSet(
  component: TaxComponent,
  filingStatus?: FilingStatus,
): TaxBracket[] | undefined {
  if (!component.brackets) return undefined;
  if (Array.isArray(component.brackets)) return component.brackets;
  if (!filingStatus) return undefined;
  return component.brackets[filingStatus];
}

/** True if this component's brackets vary by filing status. */
export function requiresFilingStatus(component: TaxComponent): boolean {
  return component.brackets !== undefined && !Array.isArray(component.brackets);
}

/**
 * Resolves a deduction/credit amount to a single number, given an optional
 * filing status. Same flat-or-keyed shape as brackets (see resolveBracketSet).
 */
export function resolveAmount(
  amount: number | Partial<Record<FilingStatus, number>>,
  filingStatus?: FilingStatus,
): number | undefined {
  if (typeof amount === "number") return amount;
  if (!filingStatus) return undefined;
  return amount[filingStatus];
}

/** True if this deduction/credit amount varies by filing status. */
export function amountRequiresFilingStatus(
  amount: number | Partial<Record<FilingStatus, number>>,
): boolean {
  return typeof amount !== "number";
}
