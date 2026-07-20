import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getEnabledCountryBySlug, listEnabledCountries } from "@/src/countries/index";
import { CountryOverview } from "./country-overview";

export function generateStaticParams() {
  return listEnabledCountries().map((c) => ({ country: c.urlSlug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ country: string }>;
}): Promise<Metadata> {
  const { country: slug } = await params;
  const country = getEnabledCountryBySlug(slug);
  if (!country) return {};

  return {
    title: `${country.name} income tax by region`,
    description: `Compare income tax across every province and territory in ${country.name} for tax year ${country.taxYear}.`,
  };
}

export default async function CountryPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { country: slug } = await params;
  const country = getEnabledCountryBySlug(slug);
  if (!country) notFound();

  const sp = await searchParams;
  return <CountryOverview country={country} searchParams={sp} />;
}
