import { ca } from "./ca";
import { us } from "./us";
import type { CountryConfig } from "./types";

/**
 * Every country the frontend knows about, enabled or not — see
 * src/countries/types.ts for what makes a country "add a config, not a
 * migration" per docs/data.md's extensibility section.
 */
const ALL_COUNTRIES: CountryConfig[] = [ca, us];

/** Countries actually routable/visible in the UI. */
export function listEnabledCountries(): CountryConfig[] {
  return ALL_COUNTRIES.filter((c) => c.enabled);
}

/** Looks up a country by its URL slug (e.g. "ca"), enabled or not. */
export function getCountryBySlug(slug: string): CountryConfig | undefined {
  return ALL_COUNTRIES.find((c) => c.urlSlug === slug);
}

/** Looks up a country by its URL slug, only if it's enabled in the UI. */
export function getEnabledCountryBySlug(slug: string): CountryConfig | undefined {
  const country = getCountryBySlug(slug);
  return country?.enabled ? country : undefined;
}

/** The default country for the unparameterized "/" route. */
export function getDefaultCountry(): CountryConfig {
  const [first] = listEnabledCountries();
  if (!first) throw new Error("no enabled countries in the registry");
  return first;
}
