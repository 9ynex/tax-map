# SEO Strategy

The data model in [data.md](data.md) is a near-perfect fit for **programmatic SEO** —
thousands of unique, genuinely useful pages generated from the same
`Jurisdiction`/`TaxComponent` data. The risk is that the UX plan in
[frontend.md](frontend.md) (client-driven interactive map, `layoutId` expansions, Zustand
state) is exactly the pattern that produces zero indexable content if not handled
deliberately. This doc covers how to get both the flashy interactive experience and real
search/social distribution.

## 1. Give every meaningful view a real URL

If region selection and comparisons live only in client state, Google sees one empty shell
page regardless of how many "views" exist inside it, and users can't bookmark or share a
specific comparison. Drive state through routes, not just client state:
- `/us/california` — single-region overview page, SSR/SSG, real text + tables.
- `/compare/us-california/us-texas?income=100000` — comparison view.
- `/us/california/100000` — income-specific breakdown, for a curated set of income levels
  only (see §4).

Clicking a region in the map should be a real navigation (Next.js `Link`/`router.push`,
which is still a fast client transition) rather than only local state — this gives shareable,
indexable URLs without sacrificing the animated feel. This is also the URL contract
[frontend.md](frontend.md) commits to: income, country, and pinned regions live in the URL,
not component state.

### URL scheme must not assume fixed jurisdiction depth

[data.md](data.md) deliberately avoids assuming every country is `federal + state/province`
(the UK and Japan aren't). The URL scheme needs the same flexibility, or adding a country
with different depth later means restructuring already-indexed URLs and losing their ranking:

- **Leaf-slug pages**: `/{countryCode}/{jurisdictionSlug}`, where the slug identifies whatever
  specific jurisdiction the page is about — a US state, a Canadian province, a UK nation like
  Scotland, or eventually a Japanese municipality — regardless of its depth in the
  `Jurisdiction` tree. `/jp/shibuya` is valid without ever requiring `/jp/tokyo/shibuya`.
- **Additive-only depth**: when a country needs finer resolution later (municipal tax in
  Ohio, Pennsylvania, or Japan), add a new page nested under the most specific *existing*
  page (`/us/ohio/columbus`) rather than restructuring `/us/ohio`. Already-indexed URLs never
  change; new pages are only ever added.
- Breadcrumbs and the List view (§2 below, and [frontend.md](frontend.md)) tie parent/child
  jurisdictions together for navigation, so the hierarchy doesn't need to be encoded in the
  URL shape itself.

## 2. Map zoom/pan must never gate crawlability

[frontend.md](frontend.md) defaults the map to a zoomed-in view (not a full-country overview)
so touch targets on small states/provinces stay usable. That's a UI decision with no direct
SEO cost, as long as two things hold:
- It's a **client-only rendering preference** — it must never change the server-rendered HTML
  per visitor. Any geo-based or default-zoom logic runs after hydration, so Googlebot and
  every visitor get the same canonical page content for a given URL.
- Every region/comparison page must be reachable through a **real `<a href>` link that
  doesn't depend on panning or zooming** the map widget — the List view (or a footer/index
  page enumerating all regions) is this safety net. It's already planned for the precision
  use case (§ frontend.md point 7); it now does double duty as the crawl path, and will
  double again as the accessibility fallback whenever that work is prioritized.

## 3. Pre-render the content, defer the flash

Use static generation (`generateStaticParams`) for region/comparison pages so the actual
numbers and text are present in the initial HTML rather than waiting on client JS. Layer the
Framer Motion map/animation in as a progressively-enhanced client component on top of that
server-rendered content. This also protects Core Web Vitals (LCP especially) — both a ranking
factor and directly relevant to future ad revenue, since ad scripts compete for the same
performance budget.

## 4. Avoid thin/duplicate content at scale

50 states × 50 states (or ×49 provinces, ×income brackets) produces a large page count fast —
good for coverage, risky for "thin content" penalties if pages are near-duplicates.
- **Canonicalize comparison direction**: `/compare/us-california/us-texas` and
  `/compare/us-texas/us-california` are the same content — pick one canonical ordering (e.g.
  alphabetical) and redirect/canonical-tag the other.
- **Income is a slider, not a finite set** — you can't statically generate a page per
  possible value. Pre-generate income-specific pages only for a curated set of commonly
  searched levels ($50k, $75k, $100k, $150k, $200k), each with genuinely different real
  numbers. Arbitrary slider values stay live-only client state and are not indexed —
  `noindex` (or simply no static route) for anything outside the curated set.
- Auto-generate `sitemap.xml` via Next.js's `sitemap.ts`, scoped to pages with real distinct
  value.
- Comparisons are same-currency only in v1 (per [data.md](data.md) — no USD-vs-CAD
  cross-country pages yet), which also keeps the compare-page matrix from ballooning across
  countries before there's a real basis for the comparison.

## 5. Shareable OG images — the primary growth loop

Generate a dynamic Open Graph image per comparison (`next/og`) — e.g. "Ontario: 29% effective
rate vs Texas: 22%" as a designed card. This is what makes a tax-comparison tool spread on
social platforms; social shares and the backlinks they generate matter as much as on-page SEO
for a tool like this.

## 6. Structured data

Add JSON-LD:
- `FAQPage` schema on region/comparison pages ("How much tax do I pay in Texas on $100k?") —
  this content type competes well for featured snippets, a major free-traffic source for
  calculator sites.
- `WebApplication` or `Dataset` schema on the tool itself.

## 7. Metadata

Per-page `generateMetadata` with unique, keyword-real titles/descriptions per region and
comparison (not one static app-wide title) — "California vs Texas Tax Comparison" beats a
generic app title on every indexed page. **Never hardcode the tax year in title/description
templates** — pull it from the data's `taxYear` field (per [data.md](data.md)) so every page
advances automatically when the annual data update lands, rather than needing a separate copy
pass across thousands of programmatic pages.

## 8. Content beyond the calculator

Bare calculators rank, but guide/explainer content earns backlinks and domain authority over
time (why SmartAsset/NerdWallet pair calculators with long-form guides). Not needed for v1,
but the routing/CMS choice should leave room for it: "how tax brackets actually work,"
"moving states for tax reasons," state-specific guides.

## 9. E-E-A-T signals for financial content

Tax content falls under Google's "Your Money or Your Life" (YMYL) category, which gets extra
ranking scrutiny under Experience/Expertise/Authoritativeness/Trustworthiness guidelines.
Three concrete, low-cost signals to build in from v1:
- **Visibly cite sources per page** (not just internally in [data.md](data.md)) — e.g. "Rates
  sourced from the IRS and Tax Foundation" with a link, on every region/comparison page.
- **Show a "data as of" date** derived from the data's `effectiveDate`/`taxYear`, so users and
  crawlers can see the content isn't stale.
- **Add an About/methodology page** explaining sourcing, update cadence, and the
  `precision: "statutory" | "estimated"` distinction from [data.md](data.md) — this is exactly
  the kind of trustworthiness signal YMYL content is evaluated on.

## 10. Ads — deferred

Ad integration is intentionally deferred until there's a real SEO/traffic base to monetize —
building the audience comes first. Kept here as a placeholder so it isn't lost:
- Financial content is a high-CPM ad category — favorable once traffic exists.
- AdSense is the realistic early tier; Mediavine/Ezoic require ~50k sessions/month minimums,
  so programmatic SEO scale is a prerequisite for the better-paying networks.
- When this is revisited, reserve fixed ad slot dimensions up front so ad insertion doesn't
  cause layout shift (CLS) on the animated map/panel, and decide ad density/placement in a way
  that's compatible with the dark-mode/animation-driven design system in
  [frontend.md](frontend.md) rather than bolting it on after the visual system is locked in.
