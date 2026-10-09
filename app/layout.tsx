import type { Metadata } from "next";
import Link from "next/link";

import { Disclaimer } from "@/components/disclaimer";
import { RegionSwitcher } from "@/components/region-switcher";
import { listEnabledCountries } from "@/src/countries/index";
import { listAllNavTargets } from "@/src/countries/listNavTargets";
import "./globals.css";

// Built from the country registry rather than hardcoded — this copy is
// wrong the moment a country is enabled/disabled otherwise (this file
// still said "Canadian provinces and territories" after the US launched).
function enabledCountryNames(): string {
  const names = listEnabledCountries().map((c) => c.name);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export const metadata: Metadata = {
  title: {
    default: "Tax Map — compare income tax by region",
    template: "%s | Tax Map",
  },
  description: `See how much income tax you'd pay across ${enabledCountryNames()}, and compare regions side by side.`,
};

const webApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Tax Map",
  applicationCategory: "FinanceApplication",
  description: `Compare income tax across ${enabledCountryNames()} at any income level.`,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplicationJsonLd) }}
        />
        <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 sm:px-6">
          <header className="flex items-center justify-between py-6">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Tax Map
            </Link>
            <RegionSwitcher targets={listAllNavTargets()} />
          </header>
          <main className="flex-1 pb-16">{children}</main>
          <footer className="flex flex-col gap-3 border-t border-border py-6">
            <Disclaimer />
            <p className="text-xs text-muted">See each region page for specific sourcing.</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
