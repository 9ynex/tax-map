import { describe, expect, it } from "vitest";
import { convertAmount } from "./currency";
import type { ExchangeRateSnapshot } from "../data/schema";

const rates: ExchangeRateSnapshot = {
  year: 2026,
  basis: "ppp",
  rates: { USD: 1, CAD: 1.174, JPY: 93.306, DKK: 5.881 },
  precision: "estimated",
  sourceUrl: "https://example.com",
};

describe("convertAmount", () => {
  it("returns the amount unchanged when both currencies are the same", () => {
    expect(convertAmount(75000, "CAD", "CAD", rates)).toBe(75000);
  });

  it("converts via the shared international-dollar basis, not a direct pairwise rate", () => {
    // 93.306 JPY = 1 international dollar = 1.174 CAD, so 93,306 JPY -> 1,174 CAD
    expect(convertAmount(93306, "JPY", "CAD", rates)).toBeCloseTo(1174, 6);
  });

  it("round-trips back to the original amount within floating-point tolerance", () => {
    const converted = convertAmount(350000, "DKK", "CAD", rates);
    const back = convertAmount(converted, "CAD", "DKK", rates);
    expect(back).toBeCloseTo(350000, 6);
  });

  it("throws for a currency missing from the snapshot", () => {
    expect(() => convertAmount(1000, "XYZ", "CAD", rates)).toThrow(/no exchange rate/);
    expect(() => convertAmount(1000, "CAD", "XYZ", rates)).toThrow(/no exchange rate/);
  });
});
