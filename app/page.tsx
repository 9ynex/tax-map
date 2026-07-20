import type { Metadata } from "next";

import { getDefaultCountry } from "@/src/countries/index";
import { CountryOverview } from "./[country]/country-overview";

export async function generateMetadata(): Promise<Metadata> {
  const country = getDefaultCountry();
  return {
    // The root URL is normally a site's highest-authority page (docs/seo.md
    // #1), so it renders the default country's real content directly rather
    // than an empty landing state — canonical still points at the country's
    // own permalink to avoid the two URLs reading as duplicate content.
    alternates: { canonical: `/${country.urlSlug}` },
  };
}

export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const country = getDefaultCountry();
  const sp = await searchParams;
  return <CountryOverview country={country} searchParams={sp} />;
}
