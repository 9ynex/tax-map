import { beforeEach, describe, expect, it } from "vitest";
import {
  getAncestors,
  getChildren,
  getJurisdiction,
  listJurisdictions,
  loadSnapshot,
  loadSnapshotChain,
  loadExchangeRates,
  resolveBracketSet,
  requiresFilingStatus,
} from "./index";
import { _resetRegistryCache } from "./registry";
import { _resetSnapshotCache } from "./snapshots";
import { _resetExchangeRateCache } from "./exchangeRates";

beforeEach(() => {
  _resetRegistryCache();
  _resetSnapshotCache();
  _resetExchangeRateCache();
});

describe("registry", () => {
  it("lists all seeded jurisdictions", () => {
    const ids = listJurisdictions().map((j) => j.id).sort();
    // 8 country roots + 13 CA provinces/territories + 51 US states/DC + 32 MX
    // entities + 4 UK nations + 18 FR régions + 47 JP prefectures + 5 GL
    // municipalities + 27 BR states
    expect(ids).toHaveLength(205);
    expect(ids).toEqual(
      expect.arrayContaining([
        "us",
        "us-ca",
        "us-tx",
        "us-dc",
        "ca",
        "ca-on",
        "ca-qc",
        "ca-bc",
        "ca-ab",
        "mx",
        "mx-cdmx",
        "mx-jal",
        "uk",
        "uk-eng",
        "uk-sct",
        "uk-wls",
        "uk-nir",
        "fr",
        "fr-idf",
        "fr-gp",
        "fr-yt",
        "jp",
        "jp-tokyo",
        "jp-osaka",
        "jp-okinawa",
        "gl",
        "gl-sermersooq",
        "gl-avannaata",
        "br",
        "br-sp",
        "br-rj",
        "br-df",
      ]),
    );
  });

  it("looks up a jurisdiction by id", () => {
    expect(getJurisdiction("us-ca")?.name).toBe("California");
    expect(getJurisdiction("nope")).toBeUndefined();
  });

  it("finds children of a parent", () => {
    expect(getChildren("us")).toHaveLength(51); // 50 states + DC
    expect(getChildren("us").map((j) => j.id)).toEqual(
      expect.arrayContaining(["us-ca", "us-tx", "us-dc"]),
    );
    expect(getChildren(null).map((j) => j.id).sort()).toEqual([
      "br",
      "ca",
      "fr",
      "gl",
      "jp",
      "mx",
      "uk",
      "us",
    ]);
  });

  it("builds the ancestor chain root-first", () => {
    expect(getAncestors("us-ca").map((j) => j.id)).toEqual(["us", "us-ca"]);
    expect(getAncestors("ca-on").map((j) => j.id)).toEqual(["ca", "ca-on"]);
    expect(getAncestors("us").map((j) => j.id)).toEqual(["us"]);
  });

  it("throws for an unknown jurisdiction id", () => {
    expect(() => getAncestors("does-not-exist")).toThrow(/unknown jurisdiction/);
  });
});

describe("snapshots", () => {
  it("loads a single jurisdiction's snapshot", () => {
    const snapshot = loadSnapshot("us-ca", 2026);
    expect(snapshot?.jurisdictionId).toBe("us-ca");
    expect(snapshot?.components.length).toBeGreaterThan(0);
  });

  it("returns null for a jurisdiction/year with no data", () => {
    expect(loadSnapshot("us-ca", 1999)).toBeNull();
  });

  it("loads the full chain from country down to the leaf", () => {
    const chain = loadSnapshotChain("us-ca", 2026);
    expect(chain.map((s) => s.jurisdictionId)).toEqual(["us", "us-ca"]);
  });

  it("caches repeated loads (same object identity)", () => {
    expect(loadSnapshot("ca-on", 2026)).toBe(loadSnapshot("ca-on", 2026));
  });
});

describe("resolveBracketSet", () => {
  it("resolves flat brackets with no filing status needed", () => {
    const snapshot = loadSnapshot("ca-on", 2026)!;
    const income = snapshot.components.find((c) => c.type === "income")!;
    expect(requiresFilingStatus(income)).toBe(false);
    expect(resolveBracketSet(income)?.length).toBeGreaterThan(0);
  });

  it("resolves filing-status-keyed brackets", () => {
    const snapshot = loadSnapshot("us", 2026)!;
    const income = snapshot.components.find((c) => c.type === "income")!;
    expect(requiresFilingStatus(income)).toBe(true);
    expect(resolveBracketSet(income)).toBeUndefined();
    expect(resolveBracketSet(income, "single")?.[0]).toEqual({ min: 0, max: 12400, rate: 0.1 });
    expect(resolveBracketSet(income, "marriedFilingJointly")?.[0]?.max).toBe(24800);
  });

  it("returns undefined for a flatRate-only component", () => {
    const snapshot = loadSnapshot("us", 2026)!;
    const payroll = snapshot.components.find((c) => c.type === "payroll")!;
    expect(resolveBracketSet(payroll)).toBeUndefined();
  });
});

describe("loadExchangeRates", () => {
  it("loads the 2026 PPP snapshot with a rate for every enabled country's currency", () => {
    const rates = loadExchangeRates(2026)!;
    expect(rates.basis).toBe("ppp");
    expect(rates.rates.USD).toBe(1);
    for (const currency of ["CAD", "MXN", "GBP", "EUR", "JPY", "DKK", "BRL"]) {
      expect(rates.rates[currency]).toBeGreaterThan(0);
    }
  });

  it("returns null for a year with no snapshot", () => {
    expect(loadExchangeRates(1999)).toBeNull();
  });

  it("caches repeated loads (same object identity)", () => {
    expect(loadExchangeRates(2026)).toBe(loadExchangeRates(2026));
  });
});
