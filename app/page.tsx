import type { Metadata } from "next";

import { loadWorldData } from "@/src/countries/loadWorldData";
import { loadExchangeRates } from "@/src/data/index";
import { WorldExplorer } from "@/components/map/world-explorer";
import { parseIncome } from "@/lib/url-state";

export const metadata: Metadata = {
  // The root URL is normally a site's highest-authority page (docs/seo.md
  // #1) — it's real content in its own right now (the world map), not a
  // stand-in for one particular country, so no canonical redirect to a
  // country permalink is needed anymore.
  title: "Compare income tax around the world",
  description:
    "An interactive world map of average effective income tax rates by country — drill into any country for a region-by-region breakdown.",
};

export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const countries = loadWorldData();
  const sp = await searchParams;
  // The slider is denominated in USD (see WorldExplorer) — averaging every
  // country's own defaultIncome across currencies (CAD, JPY, DKK, ...)
  // would blend numbers that aren't comparable into one meaningless figure,
  // exactly the mistake the PPP conversion below exists to avoid. Anchor to
  // the US's own default instead, with a flat fallback if it's ever missing.
  const fallbackIncome = countries.find((c) => c.currency === "USD")?.defaultIncome ?? 65000;
  const income = parseIncome(sp, fallbackIncome);
  const exchangeRates = loadExchangeRates(countries[0]?.taxYear ?? new Date().getFullYear());

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Income tax around the world
        </h1>
        <p className="max-w-2xl text-sm text-muted">
          Drag the slider, then click a country to drill into its regions.
        </p>
      </div>
      <WorldExplorer countries={countries} initialIncome={income} exchangeRates={exchangeRates} />
    </div>
  );
}
