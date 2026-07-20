import { beforeEach, describe, expect, it } from "vitest";
import {
  getAncestors,
  getChildren,
  getJurisdiction,
  listJurisdictions,
  loadSnapshot,
  loadSnapshotChain,
  resolveBracketSet,
  requiresFilingStatus,
} from "./index";
import { _resetRegistryCache } from "./registry";
import { _resetSnapshotCache } from "./snapshots";

beforeEach(() => {
  _resetRegistryCache();
  _resetSnapshotCache();
});

describe("registry", () => {
  it("lists all seeded jurisdictions", () => {
    const ids = listJurisdictions().map((j) => j.id).sort();
    // 2 country roots + 13 CA provinces/territories + 51 US states/DC
    expect(ids).toHaveLength(66);
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
    expect(getChildren(null).map((j) => j.id).sort()).toEqual(["ca", "us"]);
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
