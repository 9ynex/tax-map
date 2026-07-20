// Locale drives symbol placement/disambiguation, not just separators —
// en-CA renders USD as "US$65,000" (correctly disambiguating from CAD in a
// Canadian context) but that reads oddly on a US-focused page, so pick the
// locale from the currency being displayed rather than hardcoding one.
const LOCALE_BY_CURRENCY: Record<string, string> = {
  USD: "en-US",
  CAD: "en-CA",
};

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency] ?? "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPercent(rate: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(rate);
}
