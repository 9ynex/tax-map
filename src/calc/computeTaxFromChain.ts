import { requiresFilingStatus, resolveAmount, resolveBracketSet } from "../data/filingStatus";
import type {
  FilingStatus,
  Precision,
  TaxComponentType,
  TaxYearSnapshot,
} from "../data/schema";
import { resolveDeductionsAndCredits, taxFromBrackets } from "./math";

/**
 * The `computeTax(jurisdictionPath, income, filingStatus, taxYear) -> breakdown`
 * pure function described in docs/frontend.md — realized as
 * `computeTaxFromChain(snapshots, input: ComputeTaxInput)` with named fields
 * instead of four positional args (filingStatus is optional and TypeScript
 * requires optional positional params to trail required ones, so an options
 * object avoids an awkward parameter order). `jurisdictionId` is the leaf
 * jurisdiction id (e.g. "ca-on"); ancestor resolution already happened when
 * `snapshots` was loaded.
 *
 * This file has no node:fs dependency (only `../data/filingStatus.js`, which
 * is pure, and type-only imports) so it's safe to import into a client
 * component — see computeTax.ts, the fs-loading wrapper around this.
 */
export interface ComputeTaxInput {
  jurisdictionId: string;
  income: number;
  taxYear: number;
  filingStatus?: FilingStatus;
}

export interface ComponentResult {
  jurisdictionId: string;
  name: string;
  type: TaxComponentType;
  /** false for consumption/property — see `note`. */
  computed: boolean;
  taxableBase?: number;
  deductionsApplied?: number;
  creditsApplied?: number;
  amount: number;
  precision: Precision;
  currency: string;
  note?: string;
}

export interface TaxBreakdown {
  jurisdictionId: string;
  taxYear: number;
  filingStatus?: FilingStatus;
  currency: string;
  grossIncome: number;
  components: ComponentResult[];
  totalIncomeTax: number;
  totalPayrollTax: number;
  totalTax: number;
  netIncome: number;
  effectiveRate: number;
}

/**
 * Pure variant of `computeTax` that takes an already-loaded snapshot chain
 * instead of reading it from disk via `loadSnapshotChain` (which uses
 * node:fs and can't run in the browser). A server component loads the chain
 * once and ships the raw snapshots down as props; the client then re-runs
 * this function on every income-slider change with zero network round-trip —
 * the "recompute instantly" requirement in docs/frontend.md.
 */
export function computeTaxFromChain(
  snapshots: TaxYearSnapshot[],
  input: ComputeTaxInput,
): TaxBreakdown {
  const { jurisdictionId, income, taxYear, filingStatus } = input;
  if (income < 0) throw new Error("income must be non-negative");

  if (snapshots.length === 0) {
    throw new Error(`no tax data for jurisdiction "${jurisdictionId}" in ${taxYear}`);
  }

  const components: ComponentResult[] = [];
  let currency: string | undefined;

  for (const snapshot of snapshots) {
    for (const component of snapshot.components) {
      // v1 restricts comparisons (and by extension, a single computation) to a
      // shared currency — see docs/data.md. This guards against a data-entry
      // mistake mixing currencies within one jurisdiction's ancestor chain.
      if (currency === undefined) {
        currency = component.currency;
      } else if (currency !== component.currency) {
        throw new Error(
          `currency mismatch computing tax for "${jurisdictionId}": ` +
            `"${currency}" vs "${component.currency}"`,
        );
      }

      const context = `${snapshot.jurisdictionId}/${component.type}`;

      if (component.abatement) {
        const target = components.find(
          (c) => c.type === component.type && c.name === component.abatement!.targetName,
        );
        if (!target) {
          throw new Error(
            `${context}: abatement target "${component.abatement.targetName}" not found ` +
              `(must be a same-type component already computed earlier in the chain)`,
          );
        }
        pushComponent(
          components,
          {
            jurisdictionId: snapshot.jurisdictionId,
            name: component.name,
            type: component.type,
            computed: true,
            amount: -(component.abatement.rate * target.amount),
            precision: component.precision,
            currency: component.currency,
          },
          component.supersedesParent,
        );
        continue;
      }

      if (component.surtax) {
        const target = components.find(
          (c) => c.type === component.type && c.name === component.surtax!.targetName,
        );
        if (!target) {
          throw new Error(
            `${context}: surtax target "${component.surtax.targetName}" not found ` +
              `(must be a same-type component already computed earlier in the chain)`,
          );
        }
        pushComponent(
          components,
          {
            jurisdictionId: snapshot.jurisdictionId,
            name: component.name,
            type: component.type,
            computed: true,
            amount: taxFromBrackets(target.amount, component.surtax.brackets),
            precision: component.precision,
            currency: component.currency,
          },
          component.supersedesParent,
        );
        continue;
      }

      if (component.type === "consumption" || component.type === "property") {
        pushComponent(
          components,
          {
            jurisdictionId: snapshot.jurisdictionId,
            name: component.name,
            type: component.type,
            computed: false,
            amount: 0,
            precision: component.precision,
            currency: component.currency,
            note:
              component.type === "consumption"
                ? "requires a purchase amount — not computed against income"
                : "requires a home value — not computed against income",
          },
          component.supersedesParent,
        );
        continue;
      }

      if (component.type === "income") {
        if (requiresFilingStatus(component) && !filingStatus) {
          throw new Error(`${context} requires a filingStatus for ${taxYear}`);
        }
        const brackets = resolveBracketSet(component, filingStatus);
        if (!brackets) {
          throw new Error(`${context}: no brackets resolved (filingStatus=${filingStatus ?? "none"})`);
        }

        const { deductions, credits } = resolveDeductionsAndCredits(
          component.deductionsCredits,
          income,
          filingStatus,
          context,
        );
        const taxableBase = Math.max(0, income - deductions);
        const amount = Math.max(0, taxFromBrackets(taxableBase, brackets) - credits);

        pushComponent(
          components,
          {
            jurisdictionId: snapshot.jurisdictionId,
            name: component.name,
            type: "income",
            computed: true,
            taxableBase,
            deductionsApplied: deductions,
            creditsApplied: credits,
            amount,
            precision: component.precision,
            currency: component.currency,
          },
          component.supersedesParent,
        );
        continue;
      }

      if (component.type === "payroll") {
        // Payroll tax (FICA/CPP) applies to gross wages within a [floor, cap]
        // range, not to income-tax taxable income — deductions/credits here
        // (if a jurisdiction ever defines any) apply against that ranged
        // base, not against the post-income-deduction figure. The
        // floor/cap range is what lets a second tier like CPP2 (applies only
        // between the YMPE and YAMPE) share the same component shape as a
        // simple capped rate like FICA or base CPP.
        let floorValue = 0;
        if (component.floor !== undefined) {
          const resolved = resolveAmount(component.floor, filingStatus);
          if (resolved === undefined) {
            throw new Error(`${context}: floor requires a filingStatus to resolve`);
          }
          floorValue = resolved;
        }
        const upper = component.cap !== undefined ? Math.min(income, component.cap) : income;
        const rangedBase = Math.max(0, upper - floorValue);

        const { deductions, credits } = resolveDeductionsAndCredits(
          component.deductionsCredits,
          rangedBase,
          filingStatus,
          context,
        );
        const taxableBase = Math.max(0, rangedBase - deductions);
        const amount = Math.max(0, taxableBase * (component.flatRate ?? 0) - credits);

        pushComponent(
          components,
          {
            jurisdictionId: snapshot.jurisdictionId,
            name: component.name,
            type: "payroll",
            computed: true,
            taxableBase,
            deductionsApplied: deductions,
            creditsApplied: credits,
            amount,
            precision: component.precision,
            currency: component.currency,
          },
          component.supersedesParent,
        );
      }
    }
  }

  const totalIncomeTax = sumAmounts(components, "income");
  const totalPayrollTax = sumAmounts(components, "payroll");
  const totalTax = totalIncomeTax + totalPayrollTax;

  return {
    jurisdictionId,
    taxYear,
    filingStatus,
    currency: currency ?? "USD",
    grossIncome: income,
    components,
    totalIncomeTax,
    totalPayrollTax,
    totalTax,
    netIncome: income - totalTax,
    effectiveRate: income > 0 ? totalTax / income : 0,
  };
}

/**
 * Adds a component to the breakdown, honoring `supersedesParent`: if set, it
 * names one specific same-`type` ancestor component (necessarily from an
 * ancestor jurisdiction, since snapshots are processed root-first) to remove
 * before adding this one, rather than leaving it to be summed alongside this
 * one. Matching on `type` alone wouldn't be precise enough here — multiple
 * same-`type` components can coexist on one jurisdiction (federal CPP, CPP2,
 * and EI are all `type: "payroll"`), so Quebec overriding just EI (via
 * supersedesParent: "EI") must not also remove CPP/CPP2.
 */
function pushComponent(
  components: ComponentResult[],
  entry: ComponentResult,
  supersedesParent: string | undefined,
): void {
  if (supersedesParent) {
    const idx = components.findIndex(
      (c) => c.type === entry.type && c.name === supersedesParent,
    );
    if (idx !== -1) components.splice(idx, 1);
  }
  components.push(entry);
}

function sumAmounts(components: ComponentResult[], type: TaxComponentType): number {
  return components
    .filter((c) => c.type === type && c.computed)
    .reduce((total, c) => total + c.amount, 0);
}
