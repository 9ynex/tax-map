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
});
