# Tax Data Strategy

## Core insight

Tax bracket/rate data is not big data — it's a small, slow-changing ruleset (brackets,
deduction amounts, contribution caps) that governments update roughly once a year,
sometimes with mid-year inflation indexing. That means no database is needed for v1:
a versioned, git-tracked JSON data layer plus a pure calculation engine, refreshed on
an annual cadence, is enough. This is how SimpleTax/Wealthsimple Tax, SmartAsset, and
NerdWallet's calculators work under the hood.

## Data sources

### USA
- **IRS Revenue Procedures** (irs.gov) — official annual federal bracket / standard-deduction
  inflation adjustments, published as HTML/PDF.
- **Tax Foundation** (taxfoundation.org/data) — the best single aggregator: clean, footnoted
  CSV/Excel tables for all 50 states' income tax brackets, sales tax rates (state + avg
  local), and property tax comparisons. Covers most state-level normalization.
- **SSA.gov** — FICA / Social Security wage base and Medicare rate (a handful of numbers,
  changes yearly).
- **Lincoln Institute of Land Policy** — "50-State Property Tax Comparison Study," city-level
  effective property tax rates, published annually. Property tax is hyper-local (thousands
  of jurisdictions); start with state/major-metro averages and let users override with their
  actual mill rate later.

### Canada
- **CRA** — "Canadian income tax rates for individuals" page: federal and all
  provincial/territorial brackets in one official, annually-updated page.
- **CRA** — CPP/EI contribution rate pages.
- **CRA** — GST/HST/PST rates by province (only 13 jurisdictions, essentially static).

### Future countries (UK, Australia, Japan, ...)
- **EY** "Worldwide Personal Tax and Immigration Guide" and **Deloitte** international tax
  highlights — published annually in a consistent format across ~150 countries. They've
  already done cross-country normalization; use as the fastest path to new countries and as
  a secondary cross-check against each country's own tax authority.

There is no reliable free API for income tax comparison. Avalara/TaxJar/Vertex exist but are
paid sales-tax-compliance APIs, not income tax comparison tools, and are overkill here.
Manual/semi-automated ingestion from primary government sources is the right approach.

### Municipal / local tax — the weak link

Federal + state/provincial data is clean and single-sourced (above). Municipal-level data is
not, and the two countries differ:

**USA** has three separate municipal layers:
- *Local income tax* — real in several states. Ohio (RITA/CCA cover hundreds of
  municipalities), Pennsylvania (thousands of municipalities + school districts via
  Keystone/DCED), NYC, Maryland (24 counties), and Indiana (92 counties) each publish a
  single official statewide rate table (built for employer withholding, so reliable and
  comprehensive). Kentucky-style per-city occupational taxes have no such aggregator — cover
  case by case or skip initially.
- *Local sales tax* — every state Dept. of Revenue publishes downloadable local rate tables
  (retailers need them for POS systems), so city/county rates are obtainable free, just from
  50 separate sources. Tax Foundation's state-average combined rate is a reasonable v1
  approximation before doing that per-state sourcing work.
- *Property tax* — the hard one. No free, comprehensive, current source at full
  county/municipality granularity exists. Best free option: Census ACS 5-year estimates give
  *effective* property tax rate (taxes paid ÷ home value) by county — comprehensive and free,
  but an observed average, not the statutory mill rate, and lags 1-2 years. Lincoln
  Institute's study adds precision for the ~50 largest cities.

**Canada** has no municipal income tax and no municipal sales tax — GST/HST/PST are
federal/provincial only, and income tax is federal + provincial only. Property tax is the
*only* municipal layer: each municipality sets its own mill rate against a provincially
assessed value (MPAC in Ontario, BC Assessment in BC, etc.). No single clean dataset exists;
real estate sites (WOWA.ca, Zoocasa) compile annual "property tax by city" comparisons for
major metros, cross-checkable against municipal budget bylaws, with coverage thinning out
past the top ~30 cities.

**Recommendation:** treat property tax as a tiered, explicitly-labeled *estimate* rather than
matching income-tax precision. Start with county/metro-level effective rates (Census ACS for
the US, compiled metro tables for Canada), mark them clearly as estimated in the UI, and let
users override with a known local rate. For US municipal income tax, cover the states with an
official single-source table (OH, PA, MD, IN, NYC) and defer the long tail. Chasing exact
municipal accuracy everywhere at launch reintroduces the "large database to maintain" problem
this strategy is meant to avoid.

## Normalization schema

Model jurisdictions as a generic hierarchy rather than hardcoding
`country -> state -> city`, since levels differ by country (UK has no state-level income
tax; Japan has prefecture + municipal inhabitant tax).

```
Jurisdiction: { id, name, level, parentId, countryCode }

TaxComponent (attached to a jurisdiction + tax year):
  type: "income" | "payroll" | "consumption" | "property"
  brackets?: [{ min, max, rate }]     // progressive
  flatRate?: number                    // sales/consumption tax
  cap?: number                         // e.g. CPP/SS wage base
  deductions/credits: [{ name, amount, phaseOut? }]
  currency, effectiveDate, taxYear, indexedToInflation: bool
  precision: "statutory" | "estimated"   // e.g. official mill rate vs. county ACS average
```

Filing status (single/MFJ/MFS/HoH, etc.) is not a universal concept — the US has it, Canada
taxes individuals federally with no joint filing. Model it as an optional, jurisdiction-
conditional modifier on `TaxComponent` brackets rather than a top-level field every
jurisdiction must populate. The UI only surfaces it when the selected jurisdiction actually
uses it (see [frontend.md](frontend.md)).

A `TaxYearSnapshot` per jurisdiction is a single JSON file, e.g. `/data/ca/on/2026.json`,
`/data/us/ca/2026.json`.

The calculation engine is a pure function:

```
computeTax(jurisdictionPath, income, filingStatus, taxYear) -> breakdown
```

No I/O, fully testable, fast enough to run client-side. Running it client-side matters for
UX: a user dragging an income slider or toggling regions can recompute instantly with zero
network round-trip, which is what makes region comparisons feel responsive instead of laggy.

## Cross-country comparison scope (v1)

`currency` lives on every `TaxComponent`, but converting between currencies for a live
comparison (e.g. USD vs. CAD) would reintroduce exactly the kind of external, fluctuating
data dependency this strategy is built to avoid. **v1 restricts side-by-side comparison to
jurisdictions sharing a currency** (i.e. compare within the US or within Canada, not
cross-country). Cross-country FX-aware comparison is deferred until there's a defined
strategy for sourcing and caching exchange rates.

## Caching

Since the data is static and versioned, "caching" means immutable historical data plus
long-TTL current-year data:
- Past tax years: immutable, cache forever (`Cache-Control: immutable` on the CDN edge).
- Current tax year before finalized (e.g. mid-year inflation adjustments): shorter TTL, or a
  manual cache-bust on data update.
- Serve as static JSON via CDN (Cloudflare/Vercel edge) or bundle at build time
  (Next.js/Remix) — no live DB query on the hot path either way.

## Update workflow

Once or twice a year: a script fetches/parses the official sources above (regex/table
extraction where structured, manual transcription where not), diffs against the last
committed snapshot, and opens a PR for human review before merge. Git history becomes the
audit trail and source of truth, rather than a scraper that has to be trusted blindly.

## Extensibility

Adding a new country later should be "drop a new `/data/{country}/` folder plus a
country-specific tax component config," not a schema migration — as long as the jurisdiction
hierarchy and `TaxComponent` types stay generic from day one. Do not assume exactly two
levels (federal + state/province) even for the US/CA-only v1; Japan and the UK will break
that assumption immediately.

This "don't assume fixed depth" rule applies to the URL scheme too, not just the data model
— see the leaf-slug routing approach in [seo.md](seo.md).
