import { ca } from "./ca";
import { us } from "./us";
import { mx } from "./mx";
import { uk } from "./uk";
import { fr } from "./fr";
import { jp } from "./jp";
import { gl } from "./gl";
import { br } from "./br";
import type { CountryConfig } from "./types";

/**
 * Every country the frontend knows about, enabled or not — see
 * src/countries/types.ts for what makes a country "add a config, not a
 * migration" per docs/data.md's extensibility section.
 */
const ALL_COUNTRIES: CountryConfig[] = [ca, us, mx, uk, fr, jp, gl, br];

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
