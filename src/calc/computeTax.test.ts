import { beforeEach, describe, expect, it } from "vitest";
import { computeTax } from "./computeTax";
import { _resetRegistryCache } from "../data/registry";
import { _resetSnapshotCache } from "../data/snapshots";
import { loadSnapshot } from "../data/snapshots";
import { resolveBracketSet } from "../data/filingStatus";
import { listJurisdictions } from "../data/registry";
import { taxFromBrackets } from "./math";

beforeEach(() => {
  _resetRegistryCache();
  _resetSnapshotCache();
});

describe("computeTax — US federal only", () => {
  it("computes single-filer income + payroll tax with the standard deduction applied", () => {
    const result = computeTax({
      jurisdictionId: "us",
      income: 100000,
      taxYear: 2026,
      filingStatus: "single",
    });

    // taxable = 100000 - 16100 standard deduction = 83900
    // 10% of 12400 + 12% of 38000 + 22% of 33500 = 1240 + 4560 + 7370
    expect(result.totalIncomeTax).toBeCloseTo(13170, 2);
    // SS 6.2% of 100000 + Medicare 1.45% of 100000 (Additional Medicare Tax
    // doesn't trigger — income is below the $200,000 single threshold)
    expect(result.totalPayrollTax).toBeCloseTo(7650, 2);
    expect(result.totalTax).toBeCloseTo(20820, 2);
    expect(result.netIncome).toBeCloseTo(79180, 2);
    expect(result.effectiveRate).toBeCloseTo(0.2082, 5);
    expect(result.currency).toBe("USD");
  });

  it("computes MFJ with a higher standard deduction and different brackets", () => {
    const result = computeTax({
      jurisdictionId: "us",
      income: 200000,
      taxYear: 2026,
      filingStatus: "marriedFilingJointly",
    });

    // taxable = 200000 - 32200 = 167800
    // 10% of 24800 + 12% of 76000 + 22% of 67000 = 2480 + 9120 + 14740
    expect(result.totalIncomeTax).toBeCloseTo(26340, 2);
    // SS capped at 184500 * 6.2% + Medicare 1.45% of 200000 (uncapped);
    // Additional Medicare Tax doesn't trigger below the $250,000 MFJ threshold
    expect(result.totalPayrollTax).toBeCloseTo(184500 * 0.062 + 200000 * 0.0145, 2);
  });

  it("throws when filing status is required but not provided", () => {
    expect(() => computeTax({ jurisdictionId: "us", income: 50000, taxYear: 2026 })).toThrow(
      /requires a filingStatus/,
    );
  });

  it("Additional Medicare Tax triggers only above the filing-status-specific threshold — the payroll `floor` filing-status mechanism", () => {
    const single250k = computeTax({
      jurisdictionId: "us",
      income: 250000,
      taxYear: 2026,
      filingStatus: "single",
    });
    const addlSingle = single250k.components.find((c) => c.name === "Additional Medicare Tax")!;
    expect(addlSingle.amount).toBeCloseTo((250000 - 200000) * 0.009, 2);

    // MFS has a lower threshold ($125,000) than single/HoH ($200,000) — a
    // deliberate real IRS anti-avoidance feature, not an approximation.
    const mfs150k = computeTax({
      jurisdictionId: "us",
      income: 150000,
      taxYear: 2026,
      filingStatus: "marriedFilingSeparately",
    });
    const addlMfs = mfs150k.components.find((c) => c.name === "Additional Medicare Tax")!;
    expect(addlMfs.amount).toBeCloseTo((150000 - 125000) * 0.009, 2);

    // the same $150,000 doesn't trigger it at all for a single filer
    const single150k = computeTax({
      jurisdictionId: "us",
      income: 150000,
      taxYear: 2026,
      filingStatus: "single",
    });
    const addlSingleLow = single150k.components.find((c) => c.name === "Additional Medicare Tax")!;
    expect(addlSingleLow.amount).toBe(0);
  });

  it("marriedFilingSeparately brackets are exactly half of marriedFilingJointly (real IRS rule), not the same as single", () => {
    const snapshot = loadSnapshot("us", 2026)!;
    const income = snapshot.components.find((c) => c.type === "income")!;
    const mfj = resolveBracketSet(income, "marriedFilingJointly")!;
    const mfs = resolveBracketSet(income, "marriedFilingSeparately")!;
    const single = resolveBracketSet(income, "single")!;

    // MFS top bracket starts at exactly half of MFJ's ($768,700 / 2 = $384,350)
    const mfjTop = mfj[mfj.length - 1]!;
    const mfsTop = mfs[mfs.length - 1]!;
    expect(mfsTop.min).toBeCloseTo(mfjTop.min / 2, 6);
    // and that's lower than single's top bracket ($640,600) — MFS hits the
    // top rate sooner than single, not the same as single.
    const singleTop = single[single.length - 1]!;
    expect(mfsTop.min).toBeLessThan(singleTop.min);
  });
});

describe("computeTax — federal + state chain", () => {
  it("sums California state tax on top of US federal", () => {
    const federalOnly = computeTax({
      jurisdictionId: "us",
      income: 100000,
      taxYear: 2026,
      filingStatus: "single",
    });
    const withCalifornia = computeTax({
      jurisdictionId: "us-ca",
      income: 100000,
      taxYear: 2026,
      filingStatus: "single",
    });

    expect(withCalifornia.totalTax).toBeGreaterThan(federalOnly.totalTax);
    expect(withCalifornia.components.map((c) => c.jurisdictionId)).toEqual(
      expect.arrayContaining(["us", "us-ca"]),
    );
  });

  it("surfaces consumption tax as uncomputed rather than folding it into totalTax", () => {
    const result = computeTax({
      jurisdictionId: "us-ca",
      income: 100000,
      taxYear: 2026,
      filingStatus: "single",
    });

    const consumption = result.components.find((c) => c.type === "consumption");
    expect(consumption?.computed).toBe(false);
    expect(consumption?.note).toMatch(/purchase amount/);
    expect(result.totalTax).toBeCloseTo(result.totalIncomeTax + result.totalPayrollTax, 6);
  });
});

describe("computeTax — US states, sanity-checked against well-known published figures", () => {
  it("has no state income tax component in any of the nine no-income-tax states", () => {
    // AK/NH have no state-level file at all (zero state tax of any kind);
    // the rest have a sales-tax-only file (no "income" component).
    const noTaxStates = ["us-tx", "us-fl", "us-wa", "us-nv", "us-nh", "us-ak", "us-sd", "us-tn", "us-wy"];
    for (const jurisdictionId of noTaxStates) {
      const result = computeTax({ jurisdictionId, income: 80000, taxYear: 2026, filingStatus: "single" });
      const stateIncome = result.components.find(
        (c) => c.jurisdictionId === jurisdictionId && c.type === "income",
      );
      expect(stateIncome).toBeUndefined();
    }
    // and they're all identical to each other (federal + FICA only)
    const totals = noTaxStates.map(
      (id) => computeTax({ jurisdictionId: id, income: 80000, taxYear: 2026, filingStatus: "single" }).totalTax,
    );
    expect(new Set(totals.map((t) => t.toFixed(2))).size).toBe(1);
  });

  it("matches well-known published top marginal state income tax rates", () => {
    // Each pair is (jurisdictionId, widely-published top marginal rate).
    // California and New Jersey's "millionaire's tax" / Massachusetts's
    // "Fair Share Amendment" surtax are among the most frequently cited
    // state tax facts, making them a strong independent check on the
    // Tax Foundation bracket data actually being entered correctly.
    const known: [string, number][] = [
      ["us-ca", 0.133], // widely cited as the highest state rate in the country
      ["us-hi", 0.11],
      ["us-nj", 0.1075], // NJ's "millionaire's tax"
      ["us-or", 0.099],
      ["us-ma", 0.09], // 5% flat + 4% "Fair Share Amendment" surtax
      ["us-mn", 0.0985],
    ];
    for (const [jurisdictionId, expectedRate] of known) {
      const a = computeTax({ jurisdictionId, income: 5000000, taxYear: 2026, filingStatus: "single" });
      const b = computeTax({ jurisdictionId, income: 5001000, taxYear: 2026, filingStatus: "single" });
      const stateA = a.components.find((c) => c.jurisdictionId === jurisdictionId && c.type === "income")!.amount;
      const stateB = b.components.find((c) => c.jurisdictionId === jurisdictionId && c.type === "income")!.amount;
      const marginalRate = (stateB - stateA) / 1000;
      expect(marginalRate).toBeCloseTo(expectedRate, 3);
    }
  });

  it("computes sane results for every US state and DC at three income levels, all four filing statuses", () => {
    const filingStatuses = ["single", "marriedFilingJointly", "marriedFilingSeparately", "headOfHousehold"] as const;
    for (const jurisdictionId of listJurisdictions()
      .filter((j) => j.countryCode === "US" && j.level === "state")
      .map((j) => j.id)) {
      for (const income of [30000, 90000, 400000]) {
        for (const filingStatus of filingStatuses) {
          const result = computeTax({ jurisdictionId, income, taxYear: 2026, filingStatus });
          expect(result.totalTax).toBeGreaterThanOrEqual(0);
          expect(result.totalTax).toBeLessThan(income);
          expect(result.netIncome).toBeCloseTo(income - result.totalTax, 6);
          expect(result.components.some((c) => c.jurisdictionId === "us")).toBe(true);
        }
      }
    }
  });
});

describe("computeTax — Canada (no filing status required)", () => {
  it("computes federal income + CPP (base + CPP2 tier) + EI without a filingStatus", () => {
    const result = computeTax({ jurisdictionId: "ca", income: 80000, taxYear: 2026 });

    // 14% of 58523 + 20.5% of (80000 - 58523), minus the full basic personal
    // amount credit (income is below the $181,440 phase-out start, so both
    // the base and additional BPA credit apply in full) and the Canada
    // employment amount credit ($1,501 * 14%, flat — see data/README.md)
    const grossFederalTax = 58523 * 0.14 + (80000 - 58523) * 0.205;
    const bpaCredit = 2076.06 + 227.22 + 210.14;
    expect(result.totalIncomeTax).toBeCloseTo(grossFederalTax - bpaCredit, 2);
    // CPP base: (74600 - 3500 floor) * 5.95% = 4230.45 (matches CRA's published max contribution)
    // CPP2: (80000 - 74600 floor) * 4% = 216
    // EI: 68900 cap * 1.63% = 1123.07 (matches CRA's published max premium)
    const cpp = (74600 - 3500) * 0.0595;
    const cpp2 = (80000 - 74600) * 0.04;
    const ei = 68900 * 0.0163;
    expect(result.totalPayrollTax).toBeCloseTo(cpp + cpp2 + ei, 2);
    expect(result.currency).toBe("CAD");
  });

  it("applies the flat $210.14 Canada employment amount credit alongside the BPA credits", () => {
    // Real-world credit is min(employment income, $1,501) * 14%, but this app doesn't tag
    // income by type and only targets realistic (well above $1,501) incomes — see
    // data/README.md's "Modeling simplification" note — so it's modeled as flat, unlike the
    // BPA additional amount which genuinely phases out over the same income range.
    const result = computeTax({ jurisdictionId: "ca", income: 30000, taxYear: 2026 });
    const federal = result.components.find((c) => c.jurisdictionId === "ca" && c.type === "income")!;

    expect(federal.creditsApplied).toBeCloseTo(2076.06 + 227.22 + 210.14, 2);
  });

  it("caps CPP2 at the YAMPE for income above it", () => {
    const result = computeTax({ jurisdictionId: "ca", income: 200000, taxYear: 2026 });
    const cpp = (74600 - 3500) * 0.0595;
    const cpp2 = (85000 - 74600) * 0.04; // fully maxed out, not (200000 - 74600)
    const ei = 68900 * 0.0163; // capped, not 1.63% of 200000
    expect(result.totalPayrollTax).toBeCloseTo(cpp + cpp2 + ei, 2);
  });

  it("sums Ontario provincial income tax on top of Canadian federal", () => {
    const result = computeTax({ jurisdictionId: "ca-on", income: 80000, taxYear: 2026 });
    const jurisdictions = result.components.map((c) => c.jurisdictionId);
    expect(jurisdictions).toEqual(expect.arrayContaining(["ca", "ca-on"]));
  });

  it("Ontario's surtax stacks 20% + 36% (56% combined) on Ontario tax payable above the two thresholds", () => {
    const result = computeTax({ jurisdictionId: "ca-on", income: 100000, taxYear: 2026 });
    const ontarioIncomeTax = result.components.find(
      (c) => c.jurisdictionId === "ca-on" && c.name === "Ontario income tax",
    )!;
    const surtax = result.components.find((c) => c.name === "Ontario surtax")!;

    // Ontario tax payable at $100k is between the two surtax thresholds
    // ($5,818 / $7,446), so only the first 20% tier applies.
    expect(ontarioIncomeTax.amount).toBeGreaterThan(5818);
    expect(ontarioIncomeTax.amount).toBeLessThan(7446);
    expect(surtax.amount).toBeCloseTo(0.2 * (ontarioIncomeTax.amount - 5818), 2);
  });

  it("Ontario's surtax is zero below the first threshold and stacks both tiers well above the second", () => {
    const low = computeTax({ jurisdictionId: "ca-on", income: 30000, taxYear: 2026 });
    const lowOntarioTax = low.components.find(
      (c) => c.jurisdictionId === "ca-on" && c.name === "Ontario income tax",
    )!;
    expect(lowOntarioTax.amount).toBeLessThan(5818);
    expect(low.components.find((c) => c.name === "Ontario surtax")!.amount).toBeCloseTo(0, 6);

    const high = computeTax({ jurisdictionId: "ca-on", income: 500000, taxYear: 2026 });
    const highOntarioTax = high.components.find(
      (c) => c.jurisdictionId === "ca-on" && c.name === "Ontario income tax",
    )!;
    expect(highOntarioTax.amount).toBeGreaterThan(7446);
    const expectedSurtax =
      0.2 * (highOntarioTax.amount - 5818) + 0.36 * (highOntarioTax.amount - 7446);
    expect(high.components.find((c) => c.name === "Ontario surtax")!.amount).toBeCloseTo(
      expectedSurtax,
      2,
    );
  });

  it("HST supersedes federal GST rather than stacking with it (Ontario)", () => {
    const result = computeTax({ jurisdictionId: "ca-on", income: 80000, taxYear: 2026 });
    const consumption = result.components.filter((c) => c.type === "consumption");
    expect(consumption).toHaveLength(1);
    expect(consumption[0]?.jurisdictionId).toBe("ca-on"); // federal GST entry suppressed
  });

  it("provincial PST genuinely stacks with federal GST rather than superseding it (BC)", () => {
    const result = computeTax({ jurisdictionId: "ca-bc", income: 80000, taxYear: 2026 });
    const consumption = result.components.filter((c) => c.type === "consumption");
    expect(consumption.map((c) => c.jurisdictionId).sort()).toEqual(["ca", "ca-bc"]);
  });

  it("Quebec's EI override supersedes only the federal EI component, not CPP/CPP2, and QPIP stacks alongside it", () => {
    const result = computeTax({ jurisdictionId: "ca-qc", income: 80000, taxYear: 2026 });
    const payroll = result.components.filter((c) => c.type === "payroll");

    // CPP and CPP2 (type "payroll", but different `name`s) must survive —
    // supersedesParent: "EI" should only remove the component literally named "EI".
    expect(payroll.map((c) => c.name).sort()).toEqual(["CPP", "CPP2", "EI (Quebec rate)", "QPIP"]);

    const cpp = (74600 - 3500) * 0.0595;
    const cpp2 = (80000 - 74600) * 0.04;
    const eiQuebec = 68900 * 0.013; // reduced Quebec rate, not the federal 1.63%
    const qpip = 80000 * 0.0043;
    expect(result.totalPayrollTax).toBeCloseTo(cpp + cpp2 + eiQuebec + qpip, 2);

    // and QST still stacks with federal GST, same as any other non-HST province
    const consumption = result.components.filter((c) => c.type === "consumption");
    expect(consumption.map((c) => c.jurisdictionId).sort()).toEqual(["ca", "ca-qc"]);
  });

  it("Quebec Abatement rebates exactly 16.5% of the computed federal income tax, not a flat credit", () => {
    const result = computeTax({ jurisdictionId: "ca-qc", income: 200000, taxYear: 2026 });
    const federal = result.components.find(
      (c) => c.jurisdictionId === "ca" && c.name === "Federal income tax",
    )!;
    const abatement = result.components.find((c) => c.name === "Quebec Abatement")!;

    expect(abatement.amount).toBeCloseTo(-0.165 * federal.amount, 6);
    // proportional to a component computed elsewhere in the chain, not a static number —
    // recomputing at a different income should scale the abatement with it
    const resultHigh = computeTax({ jurisdictionId: "ca-qc", income: 400000, taxYear: 2026 });
    const federalHigh = resultHigh.components.find(
      (c) => c.jurisdictionId === "ca" && c.name === "Federal income tax",
    )!;
    const abatementHigh = resultHigh.components.find((c) => c.name === "Quebec Abatement")!;
    expect(abatementHigh.amount).toBeCloseTo(-0.165 * federalHigh.amount, 6);
    expect(abatementHigh.amount).not.toBeCloseTo(abatement.amount, 0);
  });

  it("Quebec's top combined marginal income tax rate lands at the well-known ~53.31%, not the naive 58.75% without the abatement", () => {
    const a = computeTax({ jurisdictionId: "ca-qc", income: 400000, taxYear: 2026 });
    const b = computeTax({ jurisdictionId: "ca-qc", income: 401000, taxYear: 2026 });
    const incomeTaxOnly = (b.totalIncomeTax - a.totalIncomeTax) / 1000;
    expect(incomeTaxOnly).toBeCloseTo(0.5331, 3);
  });

  it("phases out the federal BPA's additional amount between $181,440 and $258,482, but keeps the base amount at any income", () => {
    const below = computeTax({ jurisdictionId: "ca", income: 100000, taxYear: 2026 });
    const midway = computeTax({ jurisdictionId: "ca", income: 220000, taxYear: 2026 }); // ~50% through the phase-out band
    const above = computeTax({ jurisdictionId: "ca", income: 300000, taxYear: 2026 });

    const federalIncomeTaxComponent = (r: typeof below) =>
      r.components.find((c) => c.jurisdictionId === "ca" && c.type === "income")!;

    // full $2,303.28 BPA credit + the flat $210.14 employment amount below the phase-out
    expect(federalIncomeTaxComponent(below).creditsApplied).toBeCloseTo(
      2076.06 + 227.22 + 210.14,
      2,
    );
    // roughly half the additional $227.22 remains partway through the band; employment
    // amount doesn't phase out
    expect(federalIncomeTaxComponent(midway).creditsApplied).toBeCloseTo(
      2076.06 + 113.49 + 210.14,
      1,
    );
    // only the base $2,076.06 + employment amount survive above the phase-out — never zero
    expect(federalIncomeTaxComponent(above).creditsApplied).toBeCloseTo(2076.06 + 210.14, 2);
  });

  it("phases out Manitoba's entire BPA credit between $200,000 and $400,000, unlike the federal base/additional split", () => {
    const below = computeTax({ jurisdictionId: "ca-mb", income: 100000, taxYear: 2026 });
    const above = computeTax({ jurisdictionId: "ca-mb", income: 500000, taxYear: 2026 });

    const mbIncomeTaxComponent = (r: typeof below) =>
      r.components.find((c) => c.jurisdictionId === "ca-mb" && c.type === "income")!;

    expect(mbIncomeTaxComponent(below).creditsApplied).toBeCloseTo(1704.24, 2);
    expect(mbIncomeTaxComponent(above).creditsApplied).toBe(0); // fully phased out, unlike federal's base amount
  });

  it("computes sane results for every Canadian province and territory at three income levels", () => {
    const provinces = [
      "ca-on",
      "ca-qc",
      "ca-bc",
      "ca-ab",
      "ca-mb",
      "ca-sk",
      "ca-ns",
      "ca-nb",
      "ca-nl",
      "ca-pe",
      "ca-yt",
      "ca-nt",
      "ca-nu",
    ];

    for (const jurisdictionId of provinces) {
      for (const income of [30000, 80000, 250000]) {
        const result = computeTax({ jurisdictionId, income, taxYear: 2026 });
        expect(result.totalTax).toBeGreaterThanOrEqual(0);
        expect(result.totalTax).toBeLessThan(income); // no jurisdiction taxes >100% at these levels
        expect(result.netIncome).toBeCloseTo(income - result.totalTax, 6);
        expect(result.components.some((c) => c.jurisdictionId === jurisdictionId)).toBe(true);
        expect(result.components.some((c) => c.jurisdictionId === "ca")).toBe(true);
      }
    }
  });
});

describe("computeTax — error handling", () => {
  it("throws for a jurisdiction/year with no data anywhere in the chain", () => {
    expect(() => computeTax({ jurisdictionId: "us-ca", income: 1000, taxYear: 1999 })).toThrow(
      /no tax data/,
    );
  });

  it("throws for negative income", () => {
    expect(() =>
      computeTax({ jurisdictionId: "us", income: -1, taxYear: 2026, filingStatus: "single" }),
    ).toThrow(/non-negative/);
  });
});

describe("computeTax — Mexico (federal-only; no state levies individual-borne tax)", () => {
  it("produces identical results across all 32 states — ISN (the state payroll tax) is employer-paid, not modeled", () => {
    const mxStates = listJurisdictions()
      .filter((j) => j.countryCode === "MX" && j.level === "state")
      .map((j) => j.id);
    expect(mxStates).toHaveLength(32);

    const totals = mxStates.map(
      (id) => computeTax({ jurisdictionId: id, income: 300000, taxYear: 2026 }).totalTax,
    );
    expect(new Set(totals.map((t) => t.toFixed(2))).size).toBe(1);
  });

  it("computes ISR with cumulative bracket amounts matching SAT's published cuota fija at each threshold", () => {
    // Cross-checks the bracket table itself: taxFromBrackets at each bracket's
    // own lower limit should reproduce SAT's published "cuota fija" for that
    // bracket — the standard way Mexican tax tables are published (fixed
    // quota + marginal rate on the excess), verified against this app's
    // from-scratch bracket summation instead of trusting a single transcription.
    const knownCuotaFija: [number, number][] = [
      [10135.11, 194.59],
      [86022.11, 5051.37],
      [151176.19, 12140.13],
      [668840.14, 125485.07],
      [5107703.92, 1601862.46],
    ];
    const snapshot = loadSnapshot("mx", 2026)!;
    const isrComponent = snapshot.components.find((c) => c.name === "ISR")!;
    const brackets = resolveBracketSet(isrComponent)!;
    for (const [threshold, expectedCumulativeTax] of knownCuotaFija) {
      expect(taxFromBrackets(threshold, brackets)).toBeCloseTo(expectedCumulativeTax, 0);
    }
  });

  it("Employment Subsidy is a hard cutoff (full flat amount or zero), not a gradual phase-out", () => {
    const below = computeTax({ jurisdictionId: "mx-cdmx", income: 130000, taxYear: 2026 });
    const above = computeTax({ jurisdictionId: "mx-cdmx", income: 150000, taxYear: 2026 });
    const belowIsr = below.components.find((c) => c.name === "ISR")!;
    const aboveIsr = above.components.find((c) => c.name === "ISR")!;
    expect(belowIsr.creditsApplied).toBeCloseTo(6427.8, 2);
    expect(aboveIsr.creditsApplied).toBe(0);
  });

  it("IMSS employee contributions apply the 3xUMA floor only to the Enfermedad y Maternidad excess component", () => {
    const result = computeTax({ jurisdictionId: "mx-jal", income: 180000, taxYear: 2026 });
    const payroll = result.components.filter((c) => c.type === "payroll");
    expect(payroll.map((c) => c.name)).toEqual([
      "IMSS - Enfermedad y Maternidad (excedente)",
      "IMSS - Prestaciones en Dinero",
      "IMSS - Gastos Médicos de Pensionados",
      "IMSS - Invalidez y Vida",
      "IMSS - Cesantía en Edad Avanzada y Vejez",
    ]);
    // (180000 - 128383.92 floor) * 0.4%
    const excess = payroll.find((c) => c.name.includes("excedente"))!;
    expect(excess.amount).toBeCloseTo((180000 - 128383.92) * 0.004, 2);
    // the other four apply to the full base with no floor
    const cashBenefits = payroll.find((c) => c.name === "IMSS - Prestaciones en Dinero")!;
    expect(cashBenefits.amount).toBeCloseTo(180000 * 0.0025, 2);
  });

  it("IVA is surfaced uncomputed, same as GST/US sales tax, not folded into totalTax", () => {
    const result = computeTax({ jurisdictionId: "mx-nl", income: 300000, taxYear: 2026 });
    const iva = result.components.find((c) => c.type === "consumption")!;
    expect(iva.computed).toBe(false);
    expect(iva.note).toMatch(/purchase amount/);
  });

  it("computes sane results across all 32 states at three income levels", () => {
    const mxStates = listJurisdictions()
      .filter((j) => j.countryCode === "MX" && j.level === "state")
      .map((j) => j.id);
    for (const jurisdictionId of mxStates) {
      for (const income of [80000, 500000, 3000000]) {
        const result = computeTax({ jurisdictionId, income, taxYear: 2026 });
        expect(result.totalTax).toBeGreaterThanOrEqual(0);
        expect(result.totalTax).toBeLessThan(income);
        expect(result.netIncome).toBeCloseTo(income - result.totalTax, 6);
        expect(result.currency).toBe("MXN");
      }
    }
  });
});

describe("computeTax — United Kingdom (no filing status; Personal Allowance modeled as a phasing deduction)", () => {
  it("computes rest-of-UK Income Tax against taxable income net of the Personal Allowance", () => {
    // £40,000 gross: PA £12,570 (below the £100k taper) -> base £27,430,
    // entirely within the 20% basic-rate band.
    const result = computeTax({ jurisdictionId: "uk-eng", income: 40000, taxYear: 2026 });
    const incomeTax = result.components.find((c) => c.name === "Income Tax")!;
    expect(incomeTax.deductionsApplied).toBeCloseTo(12570, 2);
    expect(incomeTax.taxableBase).toBeCloseTo(27430, 2);
    expect(incomeTax.amount).toBeCloseTo(5486, 2);
  });

  it("tapers the Personal Allowance by £1 per £2 of income between £100,000 and £125,140", () => {
    // £110,000 is 40% through the £25,140-wide taper band -> allowance
    // drops from £12,570 to £7,570, exactly matching HMRC's own worked
    // examples for this rule (gov.uk/income-tax-rates).
    const result = computeTax({ jurisdictionId: "uk-eng", income: 110000, taxYear: 2026 });
    const incomeTax = result.components.find((c) => c.name === "Income Tax")!;
    expect(incomeTax.deductionsApplied).toBeCloseTo(7570, 2);
    expect(incomeTax.taxableBase).toBeCloseTo(102430, 2);
    expect(incomeTax.amount).toBeCloseTo(33432, 2);
  });

  it("fully exhausts the Personal Allowance at exactly £125,140, where the additional rate also begins", () => {
    const result = computeTax({ jurisdictionId: "uk-eng", income: 130000, taxYear: 2026 });
    const incomeTax = result.components.find((c) => c.name === "Income Tax")!;
    expect(incomeTax.deductionsApplied).toBe(0);
    expect(incomeTax.taxableBase).toBeCloseTo(130000, 2);
    // £37,700 @ 20% + £74,870 @ 40% + £17,430 @ 45%
    expect(incomeTax.amount).toBeCloseTo(45331.5, 2);
  });

  it("Wales and Northern Ireland fall back to the UK-wide Income Tax — no devolved variance modeled", () => {
    // Wales's Senedd-set rates currently match rest-of-UK exactly, and
    // Northern Ireland has no devolved income tax power at all, so neither
    // has its own data/uk/{region}/2026.json — same fallback mechanism as
    // Alaska/New Hampshire (US) and every Mexican state.
    const rUK = computeTax({ jurisdictionId: "uk", income: 55000, taxYear: 2026 });
    const wales = computeTax({ jurisdictionId: "uk-wls", income: 55000, taxYear: 2026 });
    const ni = computeTax({ jurisdictionId: "uk-nir", income: 55000, taxYear: 2026 });
    expect(wales.totalTax).toBeCloseTo(rUK.totalTax, 6);
    expect(ni.totalTax).toBeCloseTo(rUK.totalTax, 6);
  });

  it("Scotland's own income component supersedes (not stacks with) rest-of-UK Income Tax", () => {
    const result = computeTax({ jurisdictionId: "uk-sct", income: 60000, taxYear: 2026 });
    const names = result.components.filter((c) => c.type === "income").map((c) => c.name);
    expect(names).toEqual(["Scottish Income Tax"]);
  });

  it("Scotland's higher/advanced rates make it more expensive than rest-of-UK above the higher-rate threshold", () => {
    // A well-known real-world fact about Scottish income tax (42%/45%/48%
    // vs rUK's 40%/45%) worth cross-checking directly against the engine.
    const rUK = computeTax({ jurisdictionId: "uk-eng", income: 60000, taxYear: 2026 });
    const scotland = computeTax({ jurisdictionId: "uk-sct", income: 60000, taxYear: 2026 });
    expect(scotland.totalIncomeTax).toBeGreaterThan(rUK.totalIncomeTax);
  });

  it("National Insurance splits into an 8% main-rate band and a 2% band above the Upper Earnings Limit", () => {
    const result = computeTax({ jurisdictionId: "uk-eng", income: 60000, taxYear: 2026 });
    const ni = result.components.filter((c) => c.type === "payroll");
    expect(ni.map((c) => c.name)).toEqual([
      "National Insurance (Class 1, main rate)",
      "National Insurance (Class 1, additional rate)",
    ]);
    // (50,270 - 12,570) x 8%
    expect(ni[0]!.amount).toBeCloseTo((50270 - 12570) * 0.08, 2);
    // (60,000 - 50,270) x 2%
    expect(ni[1]!.amount).toBeCloseTo((60000 - 50270) * 0.02, 2);
  });

  it("VAT is surfaced uncomputed, same as GST/IVA/US sales tax, not folded into totalTax", () => {
    const result = computeTax({ jurisdictionId: "uk-eng", income: 60000, taxYear: 2026 });
    const vat = result.components.find((c) => c.type === "consumption")!;
    expect(vat.computed).toBe(false);
    expect(vat.note).toMatch(/purchase amount/);
  });

  it("computes sane results across all 4 UK nations at three income levels", () => {
    const ukRegions = listJurisdictions()
      .filter((j) => j.countryCode === "GB" && j.level === "state")
      .map((j) => j.id);
    expect(ukRegions).toHaveLength(4);
    for (const jurisdictionId of ukRegions) {
      for (const income of [25000, 60000, 200000]) {
        const result = computeTax({ jurisdictionId, income, taxYear: 2026 });
        expect(result.totalTax).toBeGreaterThanOrEqual(0);
        expect(result.totalTax).toBeLessThan(income);
        expect(result.netIncome).toBeCloseTo(income - result.totalTax, 6);
        expect(result.currency).toBe("GBP");
      }
    }
  });
});

describe("computeTax — France (federal-only; income tax modeled at 1 quotient-familial part)", () => {
  it("computes Impôt sur le revenu against the 2026 barème with no allowance/deduction step", () => {
    // Unlike the UK's Personal Allowance, France's 0% band is baked directly
    // into the barème itself — no separate deduction mechanism needed.
    // 0% to 11,600 + 11% x (29,579-11,600) + 30% x (30,000-29,579)
    const result = computeTax({ jurisdictionId: "fr-idf", income: 30000, taxYear: 2026 });
    const ir = result.components.find((c) => c.name === "Impôt sur le revenu")!;
    expect(ir.taxableBase).toBeCloseTo(30000, 2);
    expect(ir.amount).toBeCloseTo(2103.99, 2);
  });

  it("splits Agirc-Arrco and CEG into Tranche 1 (below PASS) and Tranche 2 (above PASS)", () => {
    // At €60,000, income exceeds the 2026 PASS (€48,060), so Tranche 2
    // should apply to the €11,940 excess on both Agirc-Arrco and CEG.
    const result = computeTax({ jurisdictionId: "fr-idf", income: 60000, taxYear: 2026 });
    const payroll = result.components.filter((c) => c.type === "payroll");
    expect(payroll.map((c) => c.name)).toEqual([
      "CSG-CRDS",
      "Assurance vieillesse (plafonnée)",
      "Assurance vieillesse (déplafonnée)",
      "Agirc-Arrco (Tranche 1)",
      "Agirc-Arrco (Tranche 2)",
      "CEG (Tranche 1)",
      "CEG (Tranche 2)",
    ]);
    const aaT1 = payroll.find((c) => c.name === "Agirc-Arrco (Tranche 1)")!;
    const aaT2 = payroll.find((c) => c.name === "Agirc-Arrco (Tranche 2)")!;
    expect(aaT1.amount).toBeCloseTo(48060 * 0.0315, 2);
    expect(aaT2.amount).toBeCloseTo((60000 - 48060) * 0.0864, 2);
    expect(result.totalTax).toBeCloseTo(23466.05, 2);
  });

  it("CSG-CRDS folds the 98.25% assiette abatement into a single effective flat rate", () => {
    const result = computeTax({ jurisdictionId: "fr-idf", income: 60000, taxYear: 2026 });
    const csgCrds = result.components.find((c) => c.name === "CSG-CRDS")!;
    // (9.2% CSG + 0.5% CRDS) x 98.25% of gross
    expect(csgCrds.amount).toBeCloseTo(60000 * 0.097 * 0.9825, 2);
  });

  it("TVA is 20% nationally but supersedes to the DROM's own rate in overseas régions", () => {
    const metropole = computeTax({ jurisdictionId: "fr-idf", income: 60000, taxYear: 2026 });
    const guadeloupe = computeTax({ jurisdictionId: "fr-gp", income: 60000, taxYear: 2026 });
    const guyane = computeTax({ jurisdictionId: "fr-gf", income: 60000, taxYear: 2026 });

    const metroTva = metropole.components.find((c) => c.type === "consumption")!;
    const gpTva = guadeloupe.components.find((c) => c.type === "consumption")!;
    const gfTva = guyane.components.find((c) => c.type === "consumption")!;

    expect(metroTva.name).toBe("TVA");
    expect(gpTva.name).toBe("TVA (Guadeloupe)");
    expect(gfTva.name).toBe("TVA (non applicable en Guyane)");
    // superseded, not stacked — exactly one consumption component per region
    expect(guadeloupe.components.filter((c) => c.type === "consumption")).toHaveLength(1);
    expect(guyane.components.filter((c) => c.type === "consumption")).toHaveLength(1);
  });

  it("Income Tax and payroll contributions are identical across all 18 régions — both are entirely national", () => {
    const frRegions = listJurisdictions()
      .filter((j) => j.countryCode === "FR" && j.level === "state")
      .map((j) => j.id);
    expect(frRegions).toHaveLength(18);

    const results = frRegions.map((id) => computeTax({ jurisdictionId: id, income: 45000, taxYear: 2026 }));
    const incomeAndPayrollTotals = results.map(
      (r) => r.totalIncomeTax + r.totalPayrollTax,
    );
    expect(new Set(incomeAndPayrollTotals.map((t) => t.toFixed(2))).size).toBe(1);
  });

  it("computes sane results across all 18 régions at three income levels", () => {
    const frRegions = listJurisdictions()
      .filter((j) => j.countryCode === "FR" && j.level === "state")
      .map((j) => j.id);
    for (const jurisdictionId of frRegions) {
      for (const income of [25000, 100000, 400000]) {
        const result = computeTax({ jurisdictionId, income, taxYear: 2026 });
        expect(result.totalTax).toBeGreaterThanOrEqual(0);
        expect(result.totalTax).toBeLessThan(income);
        expect(result.netIncome).toBeCloseTo(income - result.totalTax, 6);
        expect(result.currency).toBe("EUR");
      }
    }
  });
});

describe("computeTax — Japan (bracketedAmount + steppedAmount deduction mechanisms)", () => {
  it("給与所得控除 (bracketedAmount) computes a cumulative deduction via the same marginal logic as tax brackets", () => {
    // ¥3,000,000 gross: 給与所得控除 = 100% of the first ¥651,000 (=¥651,000)
    // + 0% of the next ¥1,249,000 (=¥0) + 30% of the ¥1,100,000 above
    // ¥1,900,000 (=¥330,000) = ¥981,000. Running base ¥2,019,000 falls in
    // the ¥1.32M–¥3.36M 基礎控除 tier (¥880,000), for total deductions of
    // ¥1,861,000 and taxable base ¥1,139,000.
    const result = computeTax({ jurisdictionId: "jp-tokyo", income: 3000000, taxYear: 2026 });
    const shotokuzei = result.components.find((c) => c.name === "所得税")!;
    expect(shotokuzei.deductionsApplied).toBeCloseTo(981000 + 880000, 2);
    expect(shotokuzei.taxableBase).toBeCloseTo(1139000, 2);
  });

  it("基礎控除 (steppedAmount) is looked up against income after 給与所得控除, not gross income", () => {
    // At ¥5,000,000 gross, running base after 給与所得控除 (¥1,441,000) is
    // ¥3,559,000 — within the ¥3,360,000–¥4,890,000 tier (¥680,000), not
    // the ¥1,320,000–¥3,360,000 tier (¥880,000) a gross-income lookup would
    // wrongly pick.
    const result = computeTax({ jurisdictionId: "jp-tokyo", income: 5000000, taxYear: 2026 });
    const shotokuzei = result.components.find((c) => c.name === "所得税")!;
    expect(shotokuzei.deductionsApplied).toBeCloseTo(1441000 + 680000, 2);
    expect(shotokuzei.taxableBase).toBeCloseTo(5000000 - 1441000 - 680000, 2);
    expect(shotokuzei.amount).toBeCloseTo(190400, 2);
  });

  it("復興特別所得税 is a flat 2.1% surtax on 所得税, not folded into it", () => {
    const result = computeTax({ jurisdictionId: "jp-tokyo", income: 5000000, taxYear: 2026 });
    const shotokuzei = result.components.find((c) => c.name === "所得税")!;
    const fukkou = result.components.find((c) => c.name === "復興特別所得税")!;
    expect(fukkou.amount).toBeCloseTo(shotokuzei.amount * 0.021, 2);
  });

  it("健康保険 (Kyokai Kenpo) is the only component that varies by prefecture — the rest are national", () => {
    const tokyo = computeTax({ jurisdictionId: "jp-tokyo", income: 6000000, taxYear: 2026 });
    const okinawa = computeTax({ jurisdictionId: "jp-okinawa", income: 6000000, taxYear: 2026 });

    const tokyoHealth = tokyo.components.find((c) => c.name.includes("健康保険"))!;
    const okinawaHealth = okinawa.components.find((c) => c.name.includes("健康保険"))!;
    expect(tokyoHealth.amount).not.toBeCloseTo(okinawaHealth.amount, 0);
    // Tokyo's 2026 rate (9.85%) is higher than Okinawa's (9.44%)
    expect(tokyoHealth.amount).toBeGreaterThan(okinawaHealth.amount);

    const withoutHealth = (r: (typeof tokyo)) =>
      r.components.filter((c) => !c.name.includes("健康保険")).reduce((sum, c) => sum + c.amount, 0);
    expect(withoutHealth(tokyo)).toBeCloseTo(withoutHealth(okinawa), 2);
  });

  it("消費税 is surfaced uncomputed, same as every other country's consumption tax", () => {
    const result = computeTax({ jurisdictionId: "jp-osaka", income: 5000000, taxYear: 2026 });
    const shouhizei = result.components.find((c) => c.type === "consumption")!;
    expect(shouhizei.computed).toBe(false);
    expect(shouhizei.note).toMatch(/purchase amount/);
  });

  it("computes sane results across a sample of prefectures at three income levels", () => {
    const jpPrefectures = listJurisdictions()
      .filter((j) => j.countryCode === "JP" && j.level === "state")
      .map((j) => j.id);
    expect(jpPrefectures).toHaveLength(47);

    for (const jurisdictionId of ["jp-hokkaido", "jp-tokyo", "jp-osaka", "jp-saga", "jp-okinawa"]) {
      for (const income of [3000000, 8000000, 20000000]) {
        const result = computeTax({ jurisdictionId, income, taxYear: 2026 });
        expect(result.totalTax).toBeGreaterThanOrEqual(0);
        expect(result.totalTax).toBeLessThan(income);
        expect(result.netIncome).toBeCloseTo(income - result.totalTax, 6);
        expect(result.currency).toBe("JPY");
      }
    }
  });
});

describe("computeTax — Greenland (flat combined rate; bracketedAmount used for a capped credit, not a deduction)", () => {
  it("Landsskat (national) and the municipal component both apply Personfradrag + Standardfradrag once each, summing to the full combined rate", () => {
    // Sermersooq: 10% landsskat + 32% (6% fælleskommunal + 26% kommuneskat)
    // = 42% combined, on (income - 60,000 - 10,000). At kr. 200,000, income
    // is below the credit's phase-out start, so Beskæftigelsesfradrag applies
    // at its full capped value (kr. 6,615 = 15,750-equivalent x 42%).
    const result = computeTax({ jurisdictionId: "gl-sermersooq", income: 200000, taxYear: 2026 });
    const landsskat = result.components.find((c) => c.name === "Landsskat")!;
    const muni = result.components.find((c) => c.name.startsWith("Fælleskommunal"))!;
    expect(landsskat.taxableBase).toBeCloseTo(130000, 2);
    expect(muni.taxableBase).toBeCloseTo(130000, 2);
    expect(landsskat.amount).toBeCloseTo(13000, 2);
    expect(muni.creditsApplied).toBeCloseTo(6615, 2);
    expect(muni.amount).toBeCloseTo(130000 * 0.32 - 6615, 2);
    expect(result.totalTax).toBeCloseTo(13000 + (130000 * 0.32 - 6615), 2);
  });

  it("Beskæftigelsesfradrag phases out linearly between kr. 250,000 and kr. 500,000 of gross income, not income after deductions", () => {
    const below = computeTax({ jurisdictionId: "gl-sermersooq", income: 200000, taxYear: 2026 });
    const midway = computeTax({ jurisdictionId: "gl-sermersooq", income: 375000, taxYear: 2026 }); // exactly halfway through the phase-out band
    const above = computeTax({ jurisdictionId: "gl-sermersooq", income: 500000, taxYear: 2026 });

    const creditOf = (r: typeof below) =>
      r.components.find((c) => c.name.startsWith("Fælleskommunal"))!.creditsApplied!;

    expect(creditOf(below)).toBeCloseTo(6615, 2);
    expect(creditOf(midway)).toBeCloseTo(6615 / 2, 2);
    expect(creditOf(above)).toBe(0);
  });

  it("Avannaata and Kujalleq's higher 28% kommuneskat makes them more expensive than the other three municipalities", () => {
    const sermersooq = computeTax({ jurisdictionId: "gl-sermersooq", income: 300000, taxYear: 2026 });
    const avannaata = computeTax({ jurisdictionId: "gl-avannaata", income: 300000, taxYear: 2026 });
    expect(avannaata.totalTax).toBeGreaterThan(sermersooq.totalTax);
  });

  it("has no consumption-tax component at all — Greenland has no VAT/GST, unlike every other enabled country", () => {
    const result = computeTax({ jurisdictionId: "gl-qeqqata", income: 300000, taxYear: 2026 });
    expect(result.components.some((c) => c.type === "consumption")).toBe(false);
  });

  it("computes sane results across all 5 municipalities at three income levels", () => {
    const glMunicipalities = listJurisdictions()
      .filter((j) => j.countryCode === "GL" && j.level === "state")
      .map((j) => j.id);
    expect(glMunicipalities).toHaveLength(5);

    for (const jurisdictionId of glMunicipalities) {
      for (const income of [150000, 400000, 900000]) {
        const result = computeTax({ jurisdictionId, income, taxYear: 2026 });
        expect(result.totalTax).toBeGreaterThanOrEqual(0);
        expect(result.totalTax).toBeLessThan(income);
        expect(result.netIncome).toBeCloseTo(income - result.totalTax, 6);
        expect(result.currency).toBe("DKK");
      }
    }
  });
});

describe("computeTax — Brazil (federal-only income tax; INSS deducted from IRPF's own base)", () => {
  it("fully exempts income at or below the R$60,000/year (R$5,000/month) Lei 15.270/25 threshold", () => {
    const result = computeTax({ jurisdictionId: "br-sp", income: 40000, taxYear: 2026 });
    const irpf = result.components.find((c) => c.name === "IRPF")!;
    expect(irpf.amount).toBe(0);
  });

  it("computes IRPF against income net of the Dedução do INSS (bracketedAmount), not gross income", () => {
    const result = computeTax({ jurisdictionId: "br-sp", income: 72000, taxYear: 2026 });
    const irpf = result.components.find((c) => c.name === "IRPF")!;
    // INSS at 72,000: 19,452 x 7.5% + (34,834.08-19,452) x 9% + (52,251.24-34,834.08)
    // x 12% + (72,000-52,251.24) x 14% = 7,698.1656 — the Redução credit is
    // tracked separately (creditsApplied), not folded into this deduction.
    expect(irpf.deductionsApplied).toBeCloseTo(7698.17, 1);
    expect(irpf.taxableBase).toBeCloseTo(72000 - 7698.17, 1);
  });

  it("the Lei 15.270/25 credit phases out linearly between R$60,000 and R$84,000, halving at the midpoint", () => {
    const below = computeTax({ jurisdictionId: "br-sp", income: 60000, taxYear: 2026 });
    const midway = computeTax({ jurisdictionId: "br-sp", income: 72000, taxYear: 2026 });
    const above = computeTax({ jurisdictionId: "br-sp", income: 84000, taxYear: 2026 });

    const creditOf = (r: typeof below) => r.components.find((c) => c.name === "IRPF")!.creditsApplied!;
    expect(creditOf(below)).toBeCloseTo(4040.06, 1);
    expect(creditOf(midway)).toBeCloseTo(4040.06 / 2, 1);
    expect(creditOf(above)).toBe(0);
  });

  it("INSS splits into 4 progressive tiers (mirroring CPP/CPP2's floor/cap split), not one flat rate", () => {
    const result = computeTax({ jurisdictionId: "br-sp", income: 120000, taxYear: 2026 });
    const inssTiers = result.components.filter((c) => c.name.startsWith("INSS"));
    expect(inssTiers.map((c) => c.name)).toEqual([
      "INSS (até 1 salário mínimo)",
      "INSS (2ª faixa)",
      "INSS (3ª faixa)",
      "INSS (4ª faixa)",
    ]);
    // top tier is capped at the R$101,706.60 ceiling, so at 120,000 income
    // it contributes exactly (101,706.60 - 52,251.24) x 14%, not more
    const topTier = inssTiers.find((c) => c.name === "INSS (4ª faixa)")!;
    expect(topTier.amount).toBeCloseTo((101706.6 - 52251.24) * 0.14, 2);
  });

  it("ICMS is the one component that varies by state — the rest (IRPF, INSS) are national", () => {
    const sp = computeTax({ jurisdictionId: "br-sp", income: 100000, taxYear: 2026 });
    const rj = computeTax({ jurisdictionId: "br-rj", income: 100000, taxYear: 2026 });

    const spIcms = sp.components.find((c) => c.type === "consumption")!;
    const rjIcms = rj.components.find((c) => c.type === "consumption")!;
    expect(spIcms.name).toBe("ICMS (São Paulo)");
    expect(rjIcms.name).toBe("ICMS (Rio de Janeiro)");
    expect(spIcms.computed).toBe(false);
    expect(spIcms.note).toMatch(/purchase amount/);

    const withoutIcms = (r: typeof sp) =>
      r.components.filter((c) => c.type !== "consumption").reduce((sum, c) => sum + c.amount, 0);
    expect(withoutIcms(sp)).toBeCloseTo(withoutIcms(rj), 2);
  });

  it("computes sane results across a sample of states at three income levels", () => {
    const brStates = listJurisdictions()
      .filter((j) => j.countryCode === "BR" && j.level === "state")
      .map((j) => j.id);
    expect(brStates).toHaveLength(27);

    for (const jurisdictionId of ["br-sp", "br-rj", "br-df", "br-am", "br-rs"]) {
      for (const income of [30000, 90000, 500000]) {
        const result = computeTax({ jurisdictionId, income, taxYear: 2026 });
        expect(result.totalTax).toBeGreaterThanOrEqual(0);
        expect(result.totalTax).toBeLessThan(income);
        expect(result.netIncome).toBeCloseTo(income - result.totalTax, 6);
        expect(result.currency).toBe("BRL");
      }
    }
  });
});
