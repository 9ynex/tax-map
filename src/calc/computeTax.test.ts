import { beforeEach, describe, expect, it } from "vitest";
import { computeTax } from "./computeTax";
import { _resetRegistryCache } from "../data/registry";
import { _resetSnapshotCache } from "../data/snapshots";
import { loadSnapshot } from "../data/snapshots";
import { resolveBracketSet } from "../data/filingStatus";
import { listJurisdictions } from "../data/registry";

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
