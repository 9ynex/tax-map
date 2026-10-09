import { describe, expect, it } from "vitest";
import { applyPhaseOut, resolveDeductionsAndCredits, taxFromBrackets } from "./math";
import type { DeductionOrCredit, TaxBracket } from "../data/index";

describe("taxFromBrackets", () => {
  const brackets: TaxBracket[] = [
    { min: 0, max: 100, rate: 0.1 },
    { min: 100, max: null, rate: 0.2 },
  ];

  it("taxes only within the first bracket", () => {
    expect(taxFromBrackets(50, brackets)).toBeCloseTo(5, 6);
  });

  it("splits across brackets correctly", () => {
    expect(taxFromBrackets(150, brackets)).toBeCloseTo(10 + 10, 6);
  });

  it("returns 0 for 0 income", () => {
    expect(taxFromBrackets(0, brackets)).toBe(0);
  });

  it("handles an unbounded top bracket", () => {
    expect(taxFromBrackets(1100, brackets)).toBeCloseTo(10 + 200, 6);
  });
});

describe("applyPhaseOut", () => {
  const phaseOut = { start: 50, end: 150 };

  it("returns the full amount with no phaseOut", () => {
    expect(applyPhaseOut(100, undefined, 9999)).toBe(100);
  });

  it("returns the full amount at or below start", () => {
    expect(applyPhaseOut(100, phaseOut, 30)).toBe(100);
    expect(applyPhaseOut(100, phaseOut, 50)).toBe(100);
  });

  it("linearly reduces between start and end", () => {
    expect(applyPhaseOut(100, phaseOut, 100)).toBeCloseTo(50, 6);
  });

  it("returns 0 at or above end", () => {
    expect(applyPhaseOut(100, phaseOut, 150)).toBe(0);
    expect(applyPhaseOut(100, phaseOut, 200)).toBe(0);
  });
});

describe("resolveDeductionsAndCredits", () => {
  it("sums flat deductions and credits separately", () => {
    const items: DeductionOrCredit[] = [
      { name: "Standard deduction", kind: "deduction", amount: 1000 },
      { name: "Credit A", kind: "credit", amount: 200 },
    ];
    expect(resolveDeductionsAndCredits(items, 5000, undefined, "ctx")).toEqual({
      deductions: 1000,
      credits: 200,
    });
  });

  it("resolves filing-status-keyed amounts", () => {
    const items: DeductionOrCredit[] = [
      {
        name: "Standard deduction",
        kind: "deduction",
        amount: { single: 1000, marriedFilingJointly: 2000 },
      },
    ];
    expect(resolveDeductionsAndCredits(items, 5000, "marriedFilingJointly", "ctx")).toEqual({
      deductions: 2000,
      credits: 0,
    });
  });

  it("throws when a filing-status-keyed amount has no filing status", () => {
    const items: DeductionOrCredit[] = [
      {
        name: "Standard deduction",
        kind: "deduction",
        amount: { single: 1000 },
      },
    ];
    expect(() => resolveDeductionsAndCredits(items, 5000, undefined, "us/income")).toThrow(
      /requires a filingStatus/,
    );
  });

  it("applies phaseOut before summing", () => {
    const items: DeductionOrCredit[] = [
      {
        name: "Phaseout credit",
        kind: "credit",
        amount: 500,
        phaseOut: { start: 1000, end: 2000 },
      },
    ];
    expect(resolveDeductionsAndCredits(items, 1500, undefined, "ctx")).toEqual({
      deductions: 0,
      credits: 250,
    });
  });

  it("returns zeros with no items", () => {
    expect(resolveDeductionsAndCredits(undefined, 1000, undefined, "ctx")).toEqual({
      deductions: 0,
      credits: 0,
    });
  });

  it("bracketedAmount computes a cumulative deduction via the same marginal-bracket logic as tax brackets", () => {
    const items: DeductionOrCredit[] = [
      {
        name: "Employment income deduction",
        kind: "deduction",
        bracketedAmount: [
          { min: 0, max: 100, rate: 1 },
          { min: 100, max: 200, rate: 0 },
          { min: 200, max: null, rate: 0.3 },
        ],
      },
    ];
    // 100% of the first 100 (=100) + 0% of the next 100 (=0) + 30% of the 50 above 200 (=15)
    expect(resolveDeductionsAndCredits(items, 250, undefined, "ctx").deductions).toBeCloseTo(115, 6);
  });

  it("steppedAmount picks the flat amount for whichever tier the base falls into, not a cumulative total", () => {
    const items: DeductionOrCredit[] = [
      {
        name: "Basic deduction",
        kind: "deduction",
        steppedAmount: [
          { upTo: 100, amount: 950 },
          { upTo: 300, amount: 880 },
          { upTo: null, amount: 580 },
        ],
      },
    ];
    expect(resolveDeductionsAndCredits(items, 50, undefined, "ctx").deductions).toBe(950);
    expect(resolveDeductionsAndCredits(items, 300, undefined, "ctx").deductions).toBe(880);
    expect(resolveDeductionsAndCredits(items, 301, undefined, "ctx").deductions).toBe(580);
  });

  it("evaluates a later steppedAmount against the running base after an earlier bracketedAmount deduction, not the original base", () => {
    // Mirrors Japan: 給与所得控除 (bracketedAmount) reduces gross income
    // first, then 基礎控除's steppedAmount tier is looked up against what's
    // left, not against gross income directly.
    const items: DeductionOrCredit[] = [
      {
        name: "Employment income deduction",
        kind: "deduction",
        bracketedAmount: [{ min: 0, max: null, rate: 0.5 }],
      },
      {
        name: "Basic deduction",
        kind: "deduction",
        steppedAmount: [
          { upTo: 400, amount: 900 },
          { upTo: null, amount: 500 },
        ],
      },
    ];
    // Gross 1000 -> employment deduction 500 -> running base 500, which is
    // above the 400 tier threshold, so the basic deduction should be 500
    // (the second tier), not 900 (which a gross-income lookup would wrongly pick).
    const result = resolveDeductionsAndCredits(items, 1000, undefined, "ctx");
    expect(result.deductions).toBe(500 + 500);
  });
});
