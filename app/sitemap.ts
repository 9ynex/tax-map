import type { MetadataRoute } from "next";

import { getChildren } from "@/src/data/index";
import { listEnabledCountries } from "@/src/countries/index";

// Set NEXT_PUBLIC_SITE_URL once a domain is live (docs/deployment.md) —
// falls back to a placeholder so `next build` doesn't need it locally.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [{ url: SITE_URL, changeFrequency: "yearly", priority: 1 }];

  const allRegionIds: string[] = [];

  for (const country of listEnabledCountries()) {
    entries.push({
      url: `${SITE_URL}/${country.urlSlug}`,
      changeFrequency: "yearly",
      priority: 0.9,
    });

    const regions = getChildren(country.rootJurisdictionId);
    for (const region of regions) {
      allRegionIds.push(region.id);
      entries.push({
        url: `${SITE_URL}/${country.urlSlug}/${region.slug}`,
        changeFrequency: "yearly",
        priority: 0.8,
      });

      for (const income of country.curatedIncomeLevels) {
        entries.push({
          url: `${SITE_URL}/${country.urlSlug}/${region.slug}/${income}`,
          changeFrequency: "yearly",
          priority: 0.5,
        });
      }
    }
  }

  // Every region can now be compared against every other, including across
  // countries (components/compare-picker.tsx) — not just within one, so
  // pairing happens over the combined list rather than per-country.
  for (let i = 0; i < allRegionIds.length; i++) {
    for (let j = i + 1; j < allRegionIds.length; j++) {
      const [a, b] = [allRegionIds[i]!, allRegionIds[j]!].sort();
      entries.push({
        url: `${SITE_URL}/compare/${a}/${b}`,
        changeFrequency: "yearly",
        priority: 0.6,
      });
    }
  }

  return entries;
}
