# Tax Data

Layout mirrors the jurisdiction hierarchy: `/data/{...ancestorSlugs}/{taxYear}.json`. Each
file is a `TaxYearSnapshot` for exactly one jurisdiction (see
[src/data/schema.ts](../src/data/schema.ts)). `jurisdictions.json` is the hierarchy manifest —
id, display name, level, parent — and doesn't change per tax year.

## Cross-currency comparison: `data/exchange-rates/{year}.json`

The `/compare/[a]/[b]` page lets a user pick any two regions, including a cross-country (and so
cross-currency) pair — comparing, say, Ontario (CAD) against Avannaata, Greenland (DKK). Naively
reusing the same nominal number for both (100,000 CAD *and* 100,000 DKK) is actively misleading:
100,000 DKK is a small fraction of 100,000 CAD's real value, so the "comparison" would really be
contrasting a high earner against a low earner while implying they're the same person.

`data/exchange-rates/{year}.json` (schema: `ExchangeRateSnapshot`, `src/data/schema.ts`) holds one
static, versioned snapshot per year of the [IMF World Economic Outlook's "Implied PPP conversion
rate"](https://www.imf.org/external/datamapper/PPPEX@WEO) — purchasing-power-parity rates, not
market exchange rates. PPP was chosen deliberately over spot FX: it answers "does this represent
comparable purchasing power," which is what a tax-burden comparison actually wants, whereas a
market rate is a volatile, forex-desk number that would make the *same* comparison look different
week to week for reasons that have nothing to do with tax law — a bad fit for a tool built on
static, once-or-twice-a-year-refreshed official data. IMF WEO itself only publishes twice a year
(April/October), so this also means the site **never calls a live currency API at request time** —
`src/data/exchangeRates.ts` just reads and caches the committed JSON, the same "commit the data,
don't hit a live API when serving a user" model every other dataset here already follows, which
incidentally means there's no rate-limit/quota exposure no matter how many comparisons run.
`src/calc/currency.ts`'s `convertAmount` converts any pair by routing through the shared
"international dollar" basis (amount ÷ source rate × target rate), so adding a new currency later
is one line in the snapshot, not a new pairwise rate for every existing currency.

The compare page uses this to convert the shared income slider (denominated in the first region's
currency) into the second region's currency before computing its tax, captioned with the
converted amount and a link to the source — never silently. If a currency isn't in the snapshot
(or no snapshot exists for that year), it falls back to the pre-conversion behavior: comparing
effective rate only, with each side's dollar figures shown in its own currency and an explicit
note that they weren't converted, rather than crashing or guessing.

## Status

**US snapshots** (`us` federal + all 50 states + DC) were pulled from primary/professional
sources for the 2026 tax year: federal brackets, standard deductions, and the Additional
Medicare Tax threshold came directly from
[irs.gov's 2026 inflation-adjustment release](https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill);
the Social Security wage base from
[ssa.gov](https://www.ssa.gov/oact/cola/cbb.html); every state's brackets, standard deduction,
and personal exemption from Tax Foundation's downloadable
[2026 State Individual Income Tax Rates and Brackets](https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/)
dataset — fetched as the raw XLSX (`2026-State-Individual-Income-Tax-Rates-Brackets.xlsx`) and
parsed directly with `openpyxl`, not summarized through an intermediate model, given the size
of a 51-jurisdiction table. State sales tax rates came the same way from Tax Foundation's
[2026 sales tax dataset](https://taxfoundation.org/data/all/state/sales-tax-rates/). These are
real, current-year numbers, not placeholders — but see the gaps below before treating any
total as exact.

**Canada snapshots** (`ca` federal + all 13 provinces/territories) were pulled from primary/
near-primary sources for the 2026 tax year: the federal income brackets came directly from
[canada.ca's current-year rates page](https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html);
CPP and EI figures from their respective CRA payroll-deductions pages; provincial/territorial
brackets were cross-checked against TaxTips.ca (a long-standing professional reference that
states its figures are "confirmed to CRA information") rather than transcribed from a single
source. These are real, current-year numbers, not placeholders — but see the gaps below before
treating any total as exact.

**Mexico snapshots** (`mx` federal only — see below for why there's no per-state data) were
pulled from official/primary sources for the 2026 tax year: ISR brackets and the Subsidio
para el Empleo from the Resolución Miscelánea Fiscal 2026 (published via the
[Diario Oficial de la Federación](https://www.dof.gob.mx/), cross-checked with
[elcontribuyente.mx](https://www.elcontribuyente.mx/tablas-isr/2026/)'s transcription of the
same); IMSS employee contribution rates and the UMA (Unidad de Medida y Actualización, the
reference value IMSS caps and floors are denominated in) from
[imss.gob.mx](https://www.imss.gob.mx/personas-trabajadoras-hogar/cuotas) and INEGI's official
2026 UMA announcement; IVA from [sat.gob.mx](https://www.sat.gob.mx/). Every ISR bracket's
cumulative tax was cross-checked against SAT's own published "cuota fija" (fixed quota) at
each threshold — see `computeTax.test.ts` — rather than trusting a single transcription pass,
the same discipline applied to the Canada and US pulls.

**United Kingdom snapshots** (`uk` UK-wide + Scotland's own devolved rates; England, Wales, and
Northern Ireland fall back to the UK-wide snapshot — see below) were pulled from primary sources
for the 2026-27 tax year: rest-of-UK Income Tax bands, the Personal Allowance, and its taper from
[gov.uk/income-tax-rates](https://www.gov.uk/income-tax-rates); Scottish Income Tax's six bands
from [gov.scot's own 2026-to-2027 rates-and-bands publication](https://www.gov.scot/publications/scottish-income-tax-rates-and-bands/pages/2026-to-2027/),
cross-checked against [mygov.scot's current-rates page](https://www.mygov.scot/scottish-income-tax/current-income-tax-rates)
(both independently agree to the pound on every threshold); Class 1 National Insurance
thresholds and rates from [gov.uk's 2026-to-2027 employer rates-and-thresholds guidance](https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027);
VAT from [gov.uk/vat-rates](https://www.gov.uk/vat-rates). These are real, current-year numbers,
not placeholders — but see the gaps below before treating any total as exact.

## United Kingdom: architecture — Personal Allowance as a phasing deduction, Scotland as a supersession

**The Personal Allowance's £1-per-£2 taper between £100,000 and £125,140 needed no new
mechanism** — it's modeled as an ordinary `"deduction"`-kind `deductionsCredits` entry (£12,570)
with `phaseOut: { start: 100000, end: 125140 }`, the same linear-phase-out mechanism already
built for Canada's Basic Personal Amount and US Additional Medicare Tax thresholds. This isn't
an approximation of the real rule the way Canada's linear BPA phase-out sometimes is for other
jurisdictions — HMRC's taper *is* exactly linear over that exact £25,140-wide band (£12,570 ÷
£25,140 = 0.5, i.e. precisely "£1 of allowance lost per £2 of income"), so `applyPhaseOut`'s
existing linear model reproduces the real law exactly, not just approximately. `brackets` for
both rest-of-UK and Scottish Income Tax are expressed net of the allowance (e.g. rest-of-UK's
basic rate band is `0–37700`, not `12571–50270` as HMRC's own consumer-facing table displays it,
since that table quotes gross income with the allowance implicitly baked in as an unstated
0% band) — `taxableBase = income - allowance` before brackets apply, exactly how the engine
already treats the US standard deduction.

**Scotland's own Income Tax entirely replaces (not stacks with) rest-of-UK Income Tax**, using
`supersedesParent: "Income Tax"` — the same mechanism Quebec's own EI rate uses against the
federal EI component. This is legally accurate: a Scottish taxpayer's income tax is calculated
under the Scottish rates and bands set by the Scottish Parliament instead of the rest-of-UK
schedule, not in addition to it. Scotland's own component carries its own copy of the Personal
Allowance deduction (same £12,570/taper), since replacing the rest-of-UK component would
otherwise silently drop it. National Insurance and VAT are reserved (UK-wide) matters the
Scottish Parliament has no power over, so `data/uk/sct/2026.json` doesn't touch them at all —
they're inherited unmodified from the `uk` root snapshot, the same ancestor-chain mechanism
that gives every Canadian province its federal CPP/EI/GST by default.

**England, Wales, and Northern Ireland have no `data/uk/{region}/2026.json` file at all** and
fall back to the UK-wide snapshot — the same mechanism already established for Alaska/New
Hampshire (US) and all 32 Mexican states. This is accurate for two different reasons per region:
Northern Ireland has no devolved income tax power whatsoever (income tax there has always been
set at Westminster), while Wales *does* have the constitutional power to vary rates (the Welsh
Rates of Income Tax) but the Welsh Government has kept them identical to rest-of-UK rates for
every year since devolution of that power — so falling back to the shared UK snapshot produces
the legally correct number for Wales too, not just a convenient simplification. If Wales ever
diverges, this needs its own `data/uk/wls/2026.json` the same way Scotland has one.

## What's modeled and how (United Kingdom)

- **Income Tax** — three bands (20%/40%/45%) for England, Wales, and Northern Ireland; six bands
  (19%/20%/21%/42%/45%/48%) for Scotland. No filing-status concept — like Canada and Mexico, the
  UK taxes individuals regardless of marital status (there is a small transferable "Marriage
  Allowance" for below-threshold spouses, deliberately not modeled — see gaps below).
- **National Insurance (Class 1, employee)** — split into two payroll components mirroring how
  CPP/CPP2 and the US Additional Medicare Tax are split: a main 8% rate on earnings between the
  Primary Threshold (£12,570/year) and the Upper Earnings Limit (£50,270/year — deliberately the
  same figure as the higher-rate Income Tax threshold, a genuine feature of UK tax design), and a
  further 2% on everything above the UEL with no cap. Employer ("secondary") NI contributions are
  out of scope, consistent with excluding employer-paid FICA, CPP, and IMSS elsewhere in this app.
- **VAT** — flat 20%, modeled the same way as GST/IVA/US sales tax (`computed: false`, needs a
  purchase amount). The 5% reduced rate (domestic energy, children's car seats, etc.) and 0%
  zero rate (most food, books, children's clothing) are real but out of scope for the same reason
  Mexico's border-zone reduced IVA rate is: this app models one flat consumption rate per
  jurisdiction, not a category-by-category schedule.

**France snapshots** (`fr` national only, plus a per-DROM VAT override — see below) were pulled
from primary/near-primary sources for the 2026 tax year: the barème de l'impôt sur le revenu
(the 5 income-tax bracket thresholds, indexed +0.9% for 2026 by the Loi de finances promulguée
le 19 février 2026) cross-checked between [toutsurmesfinances.com](https://www.toutsurmesfinances.com/impots/bareme-de-l-impot-sur-le-revenu.html)
and a search-aggregated read of [service-public.fr](https://www.service-public.fr/particuliers/vosdroits/F1419)/
[service-public.gouv.fr](https://www.service-public.gouv.fr/particuliers/actualites/A18045)
(both agreed on every threshold to the euro; the government domains themselves returned
connection errors to direct fetching this pass, the same class of access issue noted for a few
Canadian/UK government pages elsewhere in this file); CSG/CRDS rates and the 98.25% assiette,
the Plafond Annuel de la Sécurité Sociale (PASS), and Assurance Vieillesse rates from
[urssaf.fr](https://www.urssaf.fr/accueil/outils-documentation/taux-baremes.html) (the PASS
figure specifically cross-checked against [Légifrance's own published arrêté du 22 décembre
2025](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000053143451), after two secondary sources
were initially found citing last year's 2025 figure); Agirc-Arrco/CEG complementary-pension
rates from [legisocial.fr's 2026 rates page](https://www.legisocial.fr/reperes-sociaux/cotisations-agirc-arrco-2026.html),
cross-checked against an independent search aggregation; VAT/TVA rates (including the DROM
overrides) from the official customs portal, [douane.gouv.fr](https://www.douane.gouv.fr/fiche/tva-dans-les-dom).
These are real, current-year numbers, not placeholders — but see the gaps below before treating
any total as exact.

## France: architecture — national-only, like Mexico, and why the map needs a composite projection

**Personal income tax in France is entirely national — there is no régional or départemental
income tax**, the same structural fact as Mexico's federal-only ISR (see below), for a different
underlying reason: France is a unitary state, and none of its 18 régions have been delegated any
income-tax-setting power at all (contrast the UK, where Scotland genuinely does set its own
different bands). Every euro of Impôt sur le revenu, CSG/CRDS, Assurance Vieillesse, and
Agirc-Arrco/CEG is identical for a given income regardless of which région the taxpayer lives in,
so `data/fr/2026.json` is the *only* file with income/payroll components — no
`data/fr/{région}/2026.json` exists for income tax the way none exists for Mexican state ISR.

**The one genuine régional variance is VAT/TVA, in France's 5 overseas régions (DROM)**:
Guadeloupe, Martinique, and La Réunion have their own reduced 8.5% standard rate (vs. 20% in
mainland France and Corsica), while Guyane and Mayotte have no VAT applied at all. Each of these
5 régions has its own `data/fr/{région}/2026.json` with a single `"consumption"` component
carrying `supersedesParent: "TVA"` — the same supersession mechanism Canada's HST provinces use
against federal GST — so a DROM region's page shows its own real rate (or, for Guyane/Mayotte, a
`flatRate: 0` component explicitly named to say VAT doesn't apply) instead of silently inheriting
mainland France's 20%.

**Income tax is modeled at 1 "part" of the quotient familial (a single filer), not France's real
household-based system.** French income tax divides taxable income by a number of "parts" (1 for
a single person, 2 for a married couple, +0.5 per dependent child, with several more nuanced
rules on top) before applying the barème, then multiplies back — a structurally different
mechanism from the fixed 4-status `FilingStatus` enum this app uses for the US, and one with no
clean mapping onto it. Rather than force-fit French "parts" onto US-shaped filing statuses,
`usesFilingStatus` is `false` for France (`src/countries/fr.ts`) and the barème is applied
directly to gross income, i.e. exactly the 1-part/single-filer case — the same category of
simplification as excluding household composition/dependents everywhere else in this app.

**The map needed a composite projection, not just a topology file.** France's 5 overseas régions
are genuinely thousands of km from mainland France (the Caribbean, South America, the Indian
Ocean) — plotted at their true coordinates on an ordinary single-piece projection, they'd either
get cropped out of frame or force the mainland down to a barely-visible scale, the same problem
`geoAlbersUsa` solves for Alaska/Hawaii. Unlike the US, d3-geo itself has no built-in France
composite, but the community `d3-composite-projections` package ships
`geoConicConformalFrance()` — a ready-made, pre-scaled projection that insets Guadeloupe,
Martinique, Guyane, Réunion, and Mayotte near the mainland, mirroring `geoAlbersUsa` exactly.
Wiring it in needed a small extension beyond a config value, since `CountryConfig.map` is a
plain serializable object passed from server to client components, but a live d3 projection
function is not serializable: `projection` stays a *string* in the config
(`"geoConicConformalFrance"`), and `components/map/tax-map.tsx` (a client component) resolves
that string to the actual `geoConicConformalFrance()` instance itself, exactly the same
string-based indirection `CountryConfig` already used for `"geoAlbersUsa"`, just resolved one
layer further in for the one projection react-simple-maps can't name itself. `center`/`scale`
were also widened to optional on `CountryConfig.map`, since a composite projection is fully
self-contained and ignores them entirely (react-simple-maps skips its own config-application
step whenever `projection` is a function rather than a string); `width`/`height` were added
instead, since `geoConicConformalFrance()` is "configured by default for 960×500" per its own
source comment, a different frame than every other country's 800×600 default.
`public/maps/fr-regions.json` was built from [gregoiredavid/france-geojson](https://github.com/gregoiredavid/france-geojson)'s
`regions-avec-outre-mer.geojson` (INSEE region codes, all 18 régions including the 5 DROM),
simplified with `mapshaper` (~96KB). Verified live in the browser: mainland France renders as one
contiguous shape with all 13 métropole régions individually clickable, Corsica and all 5 DROM
régions render as correctly-inset, individually clickable shapes (not cropped or missing), the
world map colors France alongside the US/Canada/Mexico/UK, and region detail pages compute
correctly (Guyane's page shows "TVA (non applicable en Guyane)" instead of the mainland's 20%,
with an identical income/payroll total to every other région, confirming the supersession without
touching the national components).

## What's modeled and how (France)

- **Impôt sur le revenu** — 5 bracket bands (0%/11%/30%/41%/45%), applied directly to gross
  income at 1 quotient-familial part (see above). No deduction/allowance step is needed the way
  the UK's Personal Allowance needs one — France's barème already has the 0% band built directly
  into its bracket table.
- **CSG-CRDS** — France's broad-based social levies on wages (Contribution Sociale Généralisée +
  Contribution pour le Remboursement de la Dette Sociale), modeled as one combined payroll
  component at an effective 9.53025% (the real 9.2% CSG + 0.5% CRDS = 9.7% combined, applied to
  98.25% of gross salary after a flat 1.75% professional-expenses abatement — folded directly
  into the stored flat rate, `0.097 × 0.9825`, since this app's schema has no separate
  percentage-of-base mechanism). **Known simplification**: real CSG (6.8 of the 9.2 points) is
  itself deductible from income-tax taxable income the following year — a cross-component
  interaction (a payroll component reducing an income-tax component's base) this app doesn't
  model for any country, the same category of simplification as not modeling a CPP/EI tax credit
  for Canada. Combining CSG and CRDS into one line (rather than 3, matching real payslips) is
  deliberate: the déductible/non-déductible split has no functional effect here since that
  downstream interaction isn't modeled either.
- **Assurance Vieillesse (retirement)** — split into plafonnée (6.90%, capped at the PASS,
  €48,060/year for 2026) and déplafonnée (0.40%, uncapped), mirroring how CPP/CPP2 and NI's two
  UK tiers are split rather than blended into one rate.
- **Agirc-Arrco + CEG (complementary pension)** — mandatory private-sector complementary pension
  contributions, modeled as 4 separate components (Tranche 1 retraite 3.15% + CEG 0.86% up to the
  PASS; Tranche 2 retraite 8.64% + CEG 1.08% between 1x and 8x the PASS). Genuinely mandatory and
  large enough on a real payslip (comparable in size to Assurance Vieillesse) to warrant the same
  granularity IMSS's 5 lines got for Mexico, rather than folding into a single blended rate.
- **TVA** — flat 20% nationally, `computed: false` like every other consumption tax in this app;
  8.5% in Guadeloupe/Martinique/Réunion and not applicable at all in Guyane/Mayotte (see above).

**Japan snapshots** (`jp` national components + a per-prefecture 健康保険 override — see below)
were pulled from primary/official sources for the 2026 (令和8年) tax year: 所得税 (income tax)
brackets, 給与所得控除 (employment income deduction), and 基礎控除 (basic deduction) directly from
the National Tax Agency's own 令和8年分 PDF publications
([税額表等](https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/shinkoku/pdf/r08/zeigakuhyo.pdf),
[基礎控除の見直し等Q&A](https://www.nta.go.jp/publication/pamph/gensen/0025005-051.pdf)) — read
directly as PDFs rather than trusting a single secondary summary, after an initial web search
surfaced two conflicting basic-deduction figures for 2026 (a discrepancy traced to different
pages describing different layers of the same reform; resolved by going straight to the NTA's
own combined table); 復興特別所得税 (reconstruction surtax) from the
[NTA's dedicated overview page](https://www.nta.go.jp/publication/pamph/shotoku/fukko_tokubetsu/index.htm);
厚生年金保険 (employees' pension) and 雇用保険 (employment insurance) rates from
[mhlw.go.jp](https://www.mhlw.go.jp/topics/bukyoku/nenkin/nenkin/pdf/tp0315-2c.pdf) and a local
Hello Work office's [official 令和8年度 rate notice](https://jsite.mhlw.go.jp/tokyo-hellowork/list/tachikawa/kyushokusha/koyouhokenryouritu08.html);
子ども・子育て支援金 (the new child-support levy) and every prefecture's 協会けんぽ health-insurance
rate from [kyoukaikenpo.or.jp](https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r08/index.html)
(the official rate table, cross-checked against an independent aggregator for Tokyo, Osaka,
Hokkaido, and Okinawa); 住民税 (resident tax) rates and its own basic deduction from
[soumu.go.jp](https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_06.html)
(Japan's Ministry of Internal Affairs and Communications, the authority over local tax); 消費税
(consumption tax) from [nta.go.jp](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6105.htm).
These are real, current-year numbers, not placeholders — but see the gaps below before treating
any total as exact, and note 住民税's `"estimated"` precision flag reflecting the simplifications
described below.

## Japan: architecture — two new deduction mechanisms, and why health insurance is the one thing that varies by prefecture

**所得税/住民税 needed two new `DeductionOrCredit` mechanisms neither UK's phaseOut nor France's
supersedesParent could express** (both added to `src/data/schema.ts`, exercised by
`src/calc/math.ts`'s `resolveDeductionsAndCredits`):

- **`bracketedAmount`** — a cumulative deduction that grows at a different marginal rate per
  income band, reusing `TaxBracket[]` and `taxFromBrackets()` verbatim, just interpreted as a
  deduction amount instead of a tax amount. Models 給与所得控除 (the mandatory employment-income
  deduction every salaried taxpayer gets), whose amount grows at 100%/0%/30%/20%/10%/0% marginal
  rates across 6 income bands per the NTA's own "quick calculation" table for 令和8年分 — verified
  by hand-deriving that a cumulative-bracket reconstruction reproduces the NTA's official
  band-by-band deduction amounts to within ¥1,000 at every boundary (an artifact of the official
  table's own income-rounding convention, not a modeling error).
- **`steppedAmount`** — a genuine step function: `base` is looked up against a list of tiers and
  the matching tier's flat amount is used *as-is*, not accumulated from lower tiers the way
  `bracketedAmount` is. Models 基礎控除, which really is a cliff in the law — someone with total
  income of ¥1,320,000 gets a ¥950,000 deduction, but ¥1,320,001 gets only ¥880,000, a real drop
  of ¥70,000 from one additional yen of income (part of the "年収の壁" phenomenon Japanese tax
  policy is well known for), not a smoothed transition.
- **Sequencing**: 基礎控除's tiers are defined against income *after* 給与所得控除, not gross
  income — verified this mattered by checking that a gross-income lookup would put a meaningful
  share of ordinary salaried incomes in the wrong tier entirely. `resolveDeductionsAndCredits` now
  tracks a running base that shrinks by each prior deduction-kind entry's resolved amount, in
  array order, but *only* for `bracketedAmount`/`steppedAmount` entries — every existing
  country's plain `amount` entries keep resolving against the original, unchanged `base` exactly
  as before (verified: all 66 pre-existing tests kept passing unmodified after this change).

**Only 健康保険 (health insurance, via 協会けんぽ/Kyokai Kenpo) genuinely varies by prefecture** —
each of the 47 prefectures has its own rate (Saga's 10.55% is the highest for 2026, Okinawa's
9.44% the lowest), a real and current feature of how Kyokai Kenpo prices risk regionally, the same
category of genuine sub-national variation as US state income tax or Japanese-language sources
describe it directly. Every other component (所得税, 復興特別所得税, 厚生年金保険, 雇用保険,
子ども・子育て支援金, 住民税, 消費税) is set nationally with zero prefectural variance, so only
`data/jp/{prefecture}/2026.json` exists per prefecture, containing nothing but that one health
insurance component — structurally the mirror image of France (where only DROM VAT varies) and
conceptually distinct from Mexico (where *nothing* sub-national varies at all).

**The map didn't need a composite projection** — unlike France's overseas régions, Japan's
prefectures (Hokkaido to Okinawa) span a single, continuous, non-scattered area, so an ordinary
`geoMercator` fits all 47 without cropping or forcing an unusable zoom level, the same approach
already used for Canada and Mexico. `public/maps/jp-prefectures.json` was built from
[dataofjapan/land](https://github.com/dataofjapan/land)'s `japan.topojson` (official prefecture
boundaries keyed by standard 1–47 JIS numbering), simplified with `mapshaper` (~80KB). Verified
live in the browser: all 47 prefectures render correctly and are individually clickable, the
world map colors Japan alongside the other 5 enabled countries, and region detail pages compute
correctly (Tokyo and Osaka show different 健康保険 amounts at the same income while every other
line item matches exactly, confirming the prefecture-only variance).

## What's modeled and how (Japan)

- **所得税** — 7 national brackets (5%/10%/20%/23%/33%/40%/45%), net of 給与所得控除 and 基礎控除
  (see above). No filing-status concept modeled — Japan's own household adjustment mechanism
  (配偶者控除, 扶養控除) is per-dependent, not a small fixed set of statuses, and this app excludes
  dependent/household-composition amounts everywhere (consistent with UK/US/Canada).
- **復興特別所得税** — a flat 2.1% surtax on 所得税 payable, in effect through the end of 2037 (a
  post-2011-earthquake reconstruction-funding measure), modeled via the existing `surtax`
  mechanism with a single flat bracket rather than Ontario's tiered ones.
- **厚生年金保険** (employees' pension) — 9.15% employee share, capped at ¥7,800,000/year (the
  ¥650,000/month standard-remuneration ceiling for 2026).
- **雇用保険** (employment insurance) — 0.5% employee share, the general-business rate (the
  majority default, same convention as Mexico's private-sector-employee assumption); agriculture/
  forestry/fisheries/sake-brewing and construction have their own higher rates, not modeled.
- **子ども・子育て支援金** — a brand-new nationally uniform levy (0.115% employee share) that began
  collection in April 2026 to fund child-support programs, sharing health insurance's base/cap.
  Included specifically because it's genuinely new and in effect for the exact year modeled here
  — omitting it would have understated 2026 take-home pay by a small but real amount.
- **住民税** (resident tax, prefectural + municipal combined) — a flat 10% (4% + 6%), reusing the
  same 給与所得控除 `bracketedAmount` as 所得税 and its own flat ¥430,000 基礎控除 (unlike
  所得税's, resident tax's own basic deduction was *not* raised by the 2026 reform and stays flat,
  confirmed via a dedicated search rather than assumed). **Known simplifications**: (1) real
  resident tax is assessed on the *prior* year's income, not the current year — a well-known
  structural feature of Japanese tax (new hires/residents pay essentially nothing in their first
  year, then experience a real jump the following year), not modeled here since this app has no
  concept of a prior-year income input; (2) resident tax's own 給与所得控除 floor is technically
  ¥650,000, not the ¥740,000 special 2026–2027 addition modeled for 所得税, a difference that only
  matters at the very bottom of the income scale; (3) the small flat annual 均等割 per-capita levy
  (¥5,000/year: ¥4,000 prefectural+municipal base + ¥1,000 national 森林環境税) isn't modeled at
  all — it doesn't fit any existing rate-based mechanism (a fixed yen amount, not a % of income),
  and at this scale is immaterial to any realistic income this app targets. `precision` is set to
  `"estimated"` for this component specifically because of simplifications (1) and (2).
- **健康保険（協会けんぽ）** — the one genuinely prefecture-varying component (see above), employee
  half of each prefecture's 2026 general rate, capped at ¥16,680,000/year (the ¥1,390,000/month
  ceiling). 介護保険 (nursing-care insurance, ages 40–64 only) is a real add-on not modeled here,
  consistent with excluding every other age-conditional amount in this app.
- **消費税** — flat 10% nationally, `computed: false` like every other consumption tax here; the
  8% reduced rate (most food/non-alcoholic beverages) is real but out of scope for the same
  category-schedule reason UK/France/Mexico's reduced rates are.

**Greenland snapshots** (`gl` national Landsskat + one municipal component per municipality) were
pulled from primary sources for the 2026 tax year: the national/joint-municipal/municipal
withholding rates (landsskat 10%, fælleskommunal skat 6%, and each of the 5 municipalities' own
kommuneskat) directly from [aka.gl's own "udskrivningsprocenter" page](https://aka.gl/emner/borger/skat/skat---udskrivningsprocenter?sc_lang=da)
(Akileraartarnermut Aqutsisoqarfik, Greenland's own tax authority — its live 2026 table), which
turned up a real year-over-year change worth flagging: Kujalleq's kommuneskat rose from 27% (2025)
to 28% (2026), moving it from the same 42% combined bracket as Sermersooq/Qeqqata/Qeqertalik into
the 44% bracket alongside Avannaata — caught precisely *because* the live current-year page was
checked directly rather than trusting an older cached summary (an October-2025-dated official
"vejledning for tilflyttere" guide, fetched for the deduction figures below, still showed Kujalleq
at 43% combined). Personfradrag, Standardfradrag, and Beskæftigelsesfradrag (the amounts, caps,
and phase-out threshold) came from that same [October 2025 official newcomers' guide](https://aka.gl/-/media/aka/borger/vejledning-for-tilflyttere/vejledning-for-tilflyttere-okt2025.pdf),
cross-checked against a live web search that independently surfaced the same combined
person-plus-standard-deduction total (kr. 70,000). Whether AMA (arbejdsmarkedsafgift, a
labour-market levy) is employee- or employer-borne was independently confirmed by reading Aka's
own employer withholding manual (["Skattetræk i Grønland"](https://aka.gl/-/media/aka/borger/skat/vejledninger/2023/skattetraek/skattetraek_i_grl_da_2023.pdf))
directly — see below for why it's excluded. These are real, current-year numbers, not
placeholders, though the deduction *amounts* (as opposed to the tax *rates*, confirmed live for
2026) are the most recent independently-confirmed figures rather than a freshly-published
2026-specific update — `precision` is set to `"estimated"` for this reason; see the gaps below
before treating any total as exact.

## Greenland: architecture — a genuinely flat tax, and reusing bracketedAmount to model a capped, phasing-out credit

**Greenland's personal income tax is flat, not progressive** — a single combined percentage
(landsskat + fælleskommunal skat + kommuneskat, 42–44% depending on municipality for 2026) applied
to income net of two flat deductions, confirmed directly against Aka's own sample tax
calculation and its payroll-withholding manual (both describe one "trækprocent" — withholding
percentage — printed on a resident's tax card, not a bracket table). This is modeled as a
single-band `brackets` array (`[{min: 0, max: null, rate: ...}]`) split into two components —
**Landsskat** (10%, at the `gl` root, uniform nationally) and **Fælleskommunal skat og
kommuneskat** (6% + each municipality's own 26–28%, in `data/gl/{municipality}/2026.json`) — the
same federal/provincial split already used for every other multi-level country here, just with
both pieces being flat rates rather than bracket tables. Both components carry their own copy of
Personfradrag (kr. 60,000) and Standardfradrag (kr. 10,000) as flat deductions, so each correctly
computes its own share of the combined rate against the right base — the same "repeat the
deduction per component" pattern already established by Canada's federal *and* provincial Basic
Personal Amount credits each being defined separately (not shared from one place).

**Beskæftigelsesfradrag (the employment credit) needed `bracketedAmount` and `phaseOut` composed
together, not just one or the other** — a case neither Japan's nor any other country's usage
needed. The real formula: 17.5% of (income − kr. 70,000), capped at kr. 15,750, then reduced by
6.3% of whatever gross income exceeds kr. 250,000 — and finally, that whole kr. figure gets
multiplied by the *taxpayer's own combined tax rate* before it applies as a credit (per Aka's own
description: "Udbetalt værdi af beskæftigelsesfradrag (fradrag × samlet udskrivningsprocent)").
Modeled as:
- `bracketedAmount: [{0–70,000: 0%}, {70,000–160,000: 17.5% × combined rate}, {160,000+: 0%}]` —
  the middle band's width (kr. 90,000) is exactly chosen so 17.5% of it equals kr. 15,750, so the
  bracket's own flat top band reproduces the cap automatically, with no separate cap parameter
  needed. The final ×combined-rate multiplication is baked directly into the middle band's rate
  (e.g. Sermersooq: 0.175 × 0.42 = 0.0735) — since the combined rate is fixed per municipality,
  this is exact, not an approximation.
- `phaseOut: { start: 250000, end: 500000 }` — chosen because a linear ramp from the full capped
  amount at kr. 250,000 down to zero at kr. 500,000 is *exactly* algebraically equivalent to
  "reduce by 6.3% of the excess over kr. 250,000" (kr. 15,750 ÷ 6.3% = kr. 250,000, so the credit
  provably hits exactly zero at kr. 500,000) — verified by hand before relying on it, the same
  diligence applied to confirming the UK Personal Allowance taper is exactly linear rather than
  approximately so.
- **Ordering matters and was deliberate**: this credit is listed *before* Personfradrag/
  Standardfradrag in `deductionsCredits`, specifically so its `bracketedAmount`/`phaseOut` lookups
  use gross income (matching Aka's own "indkomstgrundlaget," i.e. gross A/B-income) rather than
  income already reduced by the flat deductions — `resolveDeductionsAndCredits`'s running-base
  mechanism (added for Japan) only decrements after a *deduction*-kind entry, so a *credit*-kind
  entry earlier in the array is unaffected by, and does not affect, that running base.

**Greenland has no broad consumption tax at all** — confirmed directly (not assumed): Greenland
is outside the EU VAT area and levies no general sales tax or VAT, relying instead on narrow
excise/import duties on specific goods (alcohol, tobacco, vehicles). Unlike every other enabled
country, `data/gl/2026.json` and every municipality file have zero `"consumption"`-type
components — this is a real, sourced fact about Greenland's tax system, not a gap.

**AMA (Arbejdsmarkedsafgift) is entirely employer-paid and excluded**, consistent with excluding
every other employer-only levy in this app (US FUTA, Canadian/UK/French/Japanese employer-side
contributions). Verified directly from Aka's own payroll manual, which states AMA "opgøres som en
procentdel af den samlede lønsum" (calculated as a percentage of the *employer's total payroll*,
1.9% private-sector for 2026), remitted by the employer alongside — but structurally separate
from — each employee's own withheld income tax, not deducted from any individual's own paycheck.

**Brazil snapshots** (`br` national IRPF + INSS, plus a per-state ICMS override — see below) were
pulled from primary/official and professional sources for the 2026 tax year: the Lei 15.270/25
income tax reform (raising the effective exemption to R$5,000/month and adding a phasing rebate
up to R$7,000/month) from an official [Ministério da Fazenda FAQ PDF](https://www.gov.br/fazenda/pt-br/acesso-a-informacao/FAQAmpliaodaIsenodoImpostodeRendaetributaomnimadasaltasrendas.docx.pdf),
read directly as a PDF rather than trusting a single secondary summary after a secondary source's
stated rebate formula didn't reproduce the official FAQ's own worked examples (see the
architecture note below for how this was resolved); the standard IRPF tabela progressiva and the
INSS contribution table, both cross-checked across two independent professional payroll/
accounting sources ([contabilizei.com.br](https://www.contabilizei.com.br/contabilidade-online/tabela-inss/)
and a second aggregator, agreeing on every bracket); every state's ICMS standard internal rate
from [mobills.com.br](https://www.mobills.com.br/tabelas/icms/), cross-checked against a second
source for two states (Alagoas, Sergipe) whose figures initially disagreed — resolved by finding
the specific state legislation behind each discrepancy (see below). These are real, current-year
numbers, not placeholders, though the IRPF component is marked `"estimated"` given the reform's
own reconciliation nuance described next — see the gaps below before treating any total as exact.

## Brazil: architecture — reverse-engineering an official worked example, and a credit that reuses bracketedAmount for its cap

**Personal income tax (IRPF) in Brazil is entirely federal — like Mexico, no state levies its
own individual income tax.** States only set ICMS (a state-level VAT-like consumption tax), so
`data/br/2026.json` is the only file with income/payroll components, and every state file
contains nothing but its own ICMS override.

**INSS (the mandatory social-security contribution) is subtracted from gross income *before*
IRPF's own brackets apply** — a real, universal rule (not a simplification), confirmed by
reverse-engineering an official worked example (see below) rather than assumed. This is modeled
by reusing Japan's `bracketedAmount` mechanism a second time: INSS's 4 progressive tiers
(7.5%/9%/12%/14%, capped at the R$8,475.55/month ceiling) are defined twice — once as their own
4 separate `"payroll"` components (mirroring how Canada splits CPP/CPP2 into floor/cap tiers, so
a real payslip-style breakdown still shows each INSS bracket as its own line), and a second time
as a `bracketedAmount` deduction inside IRPF's own `deductionsCredits`, so IRPF's `taxableBase`
is computed net of INSS exactly as Brazilian payroll withholding actually does it.

**Reverse-engineering Lei 15.270/25's rebate**: the official FAQ's prose describes a "desconto"
between R$5,000 and R$7,000/month but only tabulates 5 worked data points (discount %, tax before
discount, tax after discount at R$500 increments) rather than stating a clean formula — and a
secondary source's *stated* formula ("R$978.62 − 0.133145 × income") did not reproduce those
official data points when checked by hand. Rather than trust the unverified formula, the actual
relationship was solved directly from the official numbers: `redução = R$312.89 × (1 −
(income−5000)/2000)` reproduces all 4 checkable data points exactly (the 5th, at exactly
R$5,000, is definitionally zero extra tax). This is precisely the shape `phaseOut` already
provides — full R$312.89 credit at or below R$5,000/month, linearly to zero at R$7,000/month — so
`"Redução Lei 15.270/25"` is a plain `kind: "credit"` entry with `phaseOut: {start: 60000, end:
84000}` (annualized), no new mechanism needed. **One deliberate internal-consistency choice**:
the credit's flat `amount` field is *not* the government's cited R$312.89/month figure directly
(annualized) — it's this app's *own* IRPF-minus-INSS calculation evaluated at exactly the
R$60,000/year threshold (R$4,040.06/year), so that a taxpayer at exactly that threshold provably
owes R$0 using *this snapshot's own* bracket numbers, rather than relying on two independently-
sourced figures (the government's exact rebate constant vs. this app's own tabela/INSS
reconstruction) to cancel out perfectly by coincidence. The two are close (within a few percent)
but don't reconcile to the last cent, likely due to a rounding or vintage difference between
sources not worth chasing further — internal self-consistency (isento provably means isento) was
judged more important than matching an external constant that doesn't quite line up with this
snapshot's own other numbers.

**ICMS is the one component that varies by state** (12%–23% depending on state for 2026), the
same category of genuine sub-national variation as US state income tax, Japanese health
insurance, or French DROM VAT — modeled as each state's own `"consumption"` component, `computed:
false` like every other consumption tax here. Two states' rates needed a second look during
sourcing: Alagoas rose from 19% to 20.5% effective April 1, 2026 (modeled at 20.5%, the rate in
effect for most of the year, with `effectiveDate` set to the actual change date), and Sergipe's
"19%" vs. "20%" discrepancy across sources turned out to be base-rate-vs.-total-with-a-poverty-
fund-surcharge, not a real disagreement (modeled at the 20% all-in effective rate, matching how
Rio de Janeiro's 20%+2% poverty-fund surcharge is also folded into one 22% effective figure).

## What's modeled and how (Brazil)

- **IRPF** — 5 national brackets (0%/7.5%/15%/22.5%/27.5%), net of the INSS `bracketedAmount`
  deduction and the Lei 15.270/25 `phaseOut` credit (see above). No filing-status concept — like
  Canada, Mexico, and Japan, Brazil's own household adjustments (dependents) are per-dependent,
  excluded along with every other household-composition amount in this app.
- **INSS** — 4 progressive tiers (7.5%/9%/12%/14%), capped at the R$101,706.60/year
  (R$8,475.55/month) ceiling, split into 4 separate payroll components mirroring Canada's
  CPP/CPP2 split.
- **ICMS** — each state's own standard internal rate (12%–23%), `computed: false` like every
  other consumption tax in this app.

## Mexico: architecture — why there's no per-state data

**Personal income tax in Mexico is constitutionally and exclusively federal.** Unlike the US
and Canada, Mexican states do not levy their own income tax on wages — there is no state-level
ISR. What states *do* levy is the Impuesto Sobre Nómina (ISN, "payroll tax"), typically 2–3% of
total wages paid — but ISN is a tax on the **employer**, not withheld from an employee's
paycheck, structurally identical to a state unemployment-insurance tax. Since this app models
what an individual actually pays, not employer-side costs (the same reasoning already applied
to excluding Washington's WA Cares and Massachusetts's employer-paid PFML contributions), ISN
is deliberately not modeled, and **no `data/mx/{state}/2026.json` files exist at all** — every
Mexican state's jurisdiction entry exists in `jurisdictions.json` (for the map/routing/URL
structure to work correctly, since the political geography is real regardless of tax
uniformity), but `loadSnapshotChain` naturally falls back to federal-only for all 32, the same
mechanism already established for Alaska and New Hampshire in the US. This was verified
directly: computing tax for all 32 states at the same income produces byte-identical results
(see `computeTax.test.ts`).

**Practical consequence**: this app cannot show meaningful regional tax variation within
Mexico the way it can for US states or Canadian provinces, because none exists for the taxes
this app models. A future "cost of living" or "property tax" layer would be where Mexican
regional comparison actually becomes interesting — not income tax.

## Mexico: what's modeled and how

- **ISR** (Impuesto Sobre la Renta) — 11 progressive annual brackets, 1.92% to 35%, no
  filing-status concept (Mexico taxes individuals regardless of marital status, same shape as
  Canada's federal ISR-equivalent). Verified bracket-by-bracket against SAT's published
  cumulative "cuota fija" at every threshold.
- **Subsidio para el Empleo** (Employment Subsidy) — modeled as a `"credit"`-kind
  `deductionsCredits` entry, $6,427.80/year (the 2026 flat monthly amount of $535.65 × 12), with
  a **hard cutoff**, not a gradual phase-out: the full amount applies for annual income up to
  $137,911.92 (the monthly $11,492.66 cap × 12), and zero above it. This is a genuine change in
  Mexican law — the subsidy used to be a declining multi-tier table, but a decree published
  December 31, 2025 simplified it to this flat-then-cliff structure for 2026. Modeled using the
  existing `phaseOut` mechanism with `start` equal to `end`, which collapses the normally-linear
  interpolation into a step function — no schema change needed. **Known simplification**: real
  payroll calculates this per pay period, not on annualized income; someone with irregular
  monthly income near the cutoff could see a different result filing their annual return than
  this annualized model produces. Also, the real subsidy can make a worker's net tax *negative*
  (a cash payment beyond zero tax) for very low earners — this app's engine floors every
  jurisdiction's computed tax at zero (a shared behavior, not Mexico-specific), so that
  refundable aspect isn't represented; income near or below the subsidy cutoff will show $0 ISR
  rather than a small net payment.
- **IMSS employee contributions** — modeled as five separate payroll components (not a single
  blended rate), mirroring how CPP/CPP2 were split for Canada: Enfermedad y Maternidad
  (0.40%, but only on the excess over 3×UMA — the one component with a `floor`), Prestaciones
  en Dinero (0.25%), Gastos Médicos de Pensionados (0.375%), Invalidez y Vida (0.625%), and
  Cesantía en Edad Avanzada y Vejez (1.125%), all capped at 25×UMA ($1,069,866/year for 2026).
  **Known simplification**: real IMSS contributions are calculated against the Salario Base de
  Cotización (SBC), which factors in benefit components (prorated aguinaldo, vacation premium)
  via an "integration factor," not raw gross salary — this app uses the `income` input directly
  as an SBC proxy, the same category of simplification already applied to Canada's "net income"
  and the US's payroll wage base. A spot-check against one third-party payroll example (a
  $15,000/month salary) came out about 15% higher than that example's cited figure; the rates
  used here were independently cross-verified and are internally consistent (the five
  percentages sum to the commonly-cited ~2.775% aggregate employee rate), so this is noted as
  an open discrepancy rather than silently trusted or silently "fixed" toward an unverified
  single example.
- **IVA** — flat 16%, modeled the same way as GST/US sales tax (`computed: false`, needs a
  purchase amount). The reduced 8% border-zone IVA rate (parts of six northern-border states)
  is a sub-state/municipal-level exception and is out of scope for the same reason municipal
  income tax is deferred everywhere else in this app — see docs/data.md.

~~`src/countries/mx.ts` exists with `enabled: false` — no map topology file exists yet.~~
**Fixed.** `public/maps/mx-states.json` was built from CONABIO 2023 municipal boundaries
(via [PhantomInsights/mexico-geojson](https://github.com/PhantomInsights/mexico-geojson)),
dissolved per state with `shapely`, then simplified and converted to TopoJSON with
`mapshaper` (32 states, ~218KB, matching the size/precision of the existing CA/US map files).
`src/countries/mx.ts` is now `enabled: true` with a `geoMercator` fit computed against the
real file. Verified live in the browser: all 32 states render correctly and are individually
clickable, the world map colors Mexico alongside US/Canada, the region detail page/breakdown
render correctly with all 6 components, and the "Jump to…" nav search and cross-country
compare picker both list every Mexican state correctly grouped under "Mexico" (and correctly
disambiguate from "New Mexico," a US state). One pre-existing issue found during verification,
unrelated to this change: the `/compare/[a]/[b]` page's body renders blank regardless of which
two regions are compared — reproduced with `ca-on` vs `ca-qc`, so it's not Mexico-specific and
was not introduced by this pass. Left as-is, not investigated further, since it's outside this
task's scope.

`public/maps/uk-nations.json` was built from the Office for National Statistics' official
["Countries (December 2022) Boundaries UK BUC"](https://geoportal.statistics.gov.uk/datasets/99ac6ae4ea4d42a9b0fff4171b7366db_0)
dataset (Ordnance Survey/ONS Open Government Licence data, fetched directly from its ArcGIS
FeatureServer, not a third-party mirror), simplified from 314 island/mainland parts down to 4
features with `mapshaper` (20% node retention — enough to keep Shetland, Orkney, and the Outer
Hebrides recognizable while dropping single-pixel skerries) and converted to TopoJSON (4
nations, ~25KB, deliberately smaller than the US/CA/MX map files since there are only 4 features
to encode). `src/countries/uk.ts` is `enabled: true` with a `geoMercator` fit computed against
the real file. `public/maps/world-countries.json`'s pre-existing United Kingdom feature had
`slug: "gb"` (an ISO-alpha-2 leftover from however that file was originally built) while every
other enabled country's `urlSlug` equals its own map slug — renamed to `slug: "uk"` to match
`uk.ts`'s `urlSlug`, otherwise the world map would render the UK as permanently muted/
non-interactive despite being enabled. Verified live in the browser: all 4 nations render
correctly and are individually clickable on the UK's own map, the world map colors the UK
alongside US/Canada/Mexico, and the region detail pages compute correctly (Scotland's page
cites `gov.scot` as an additional source; England/Wales/Northern Ireland's pages don't, since
they use the shared UK-wide component). The pre-existing `/compare/[a]/[b]` blank-body bug
(noted above for Mexico) reproduces identically for a UK pairing (`us-ca` vs `uk-eng`) —
confirms it's a general, pre-existing bug rather than anything jurisdiction-specific.

## Known gaps in what's modeled

- **Quebec's income brackets are marked `"precision": "estimated"`, not `"statutory"`.**
  TaxTips.ca explicitly flags that the 2026 Quebec indexation factor and brackets have not yet
  been confirmed against Revenu Québec's own publication (their site returned a 403 to direct
  fetching, so this couldn't be cross-checked independently this pass). Re-verify against
  revenuquebec.ca once accessible and promote to `"statutory"`.

- ~~HST provinces double-count against federal GST if naively summed.~~ **Fixed.** Every
  `TaxComponent` now has a required `name` (src/data/schema.ts) — e.g. "GST", "CPP", "EI" — and
  an optional `supersedesParent: string` naming the specific same-`type` ancestor component it
  replaces. `computeTax`'s `pushComponent` helper drops the matching earlier entry (by `type`
  *and* `name`, not `type` alone — see next bullet for why that precision mattered) before
  adding the new one. Ontario (13%), Nova Scotia (14%), New Brunswick (15%), Newfoundland and
  Labrador (15%), and Prince Edward Island (15%) all set `supersedesParent: "GST"` on their HST
  `consumption` component. Quebec (QST), British Columbia (PST), Manitoba (RST), and
  Saskatchewan (PST) leave it unset since their provincial sales taxes genuinely stack with
  federal GST. Alberta, Yukon, Northwest Territories, and Nunavut have no provincial
  consumption component at all, so federal GST alone is already correct for them. See
  `computeTax.test.ts` for coverage of both the superseding and stacking cases.

- ~~Quebec's actual EI rate is lower than the federal snapshot's, and isn't modeled.~~ **Fixed.**
  `data/ca/qc/2026.json` now has its own `"EI (Quebec rate)"` payroll component (1.30%, same
  $68,900 cap) with `supersedesParent: "EI"`, plus a separate `"QPIP"` component (0.43%,
  $103,000 cap, left additive since it's a genuinely separate premium, not a GST/HST-style
  replacement). Matching by `name` rather than `type` here was the whole reason `type`-level
  supersession wasn't good enough: Quebec's federal ancestor chain has three `type: "payroll"`
  components (CPP, CPP2, EI), and only EI should be replaced — a naive `type`-only match would
  have also wiped out CPP and CPP2. See the Quebec-specific test in `computeTax.test.ts`.

- ~~Basic personal amounts (federal and every province/territory) are not modeled.~~ **Fixed.**
  Every jurisdiction's income `TaxComponent` now carries a `"credit"`-kind `deductionsCredits`
  entry (no schema change needed — this is exactly what `kind: "credit"` and `phaseOut` were
  built for). Each credit's dollar `amount` is precomputed as *BPA dollar amount × that
  jurisdiction's own lowest marginal rate*, matching how Canadian non-refundable credits
  actually work in law (not a flat deduction off taxable income). BPA dollar amounts and
  phase-out ranges came from TaxTips.ca's consolidated 2026 non-refundable-credits table,
  cross-checked federal figures against the same canada.ca page used for the brackets.
  - **Federal and Yukon** (Yukon's BPA is legislatively harmonized to mirror the federal one)
    split into two credit entries: a base amount that always applies, and an "additional"
    amount that phases linearly to zero between $181,440 and $258,482 — the same thresholds as
    the third/fourth federal bracket boundaries already in the data.
  - **Manitoba** has its own, different full phase-out: the *entire* credit (not just an
    "additional" portion) phases linearly to zero between $200,000 and $400,000 net income.
  - All other provinces/territories use one flat, non-phasing credit.
  - **Not verified per-province**: TaxTips.ca's summary explicitly called out only federal/
    Yukon and Manitoba as having phase-outs; the other 10 jurisdictions were trusted on that
    document's word rather than individually re-confirmed against each province's own
    publication. If any of them has quietly added an income-based BPA claw-back, it isn't
    reflected here.
  - See the two federal/Manitoba phase-out tests in `computeTax.test.ts` for coverage,
    including an exact-value check at the midpoint of the federal phase-out band.

- ~~Quebec's federal tax is overstated by ~16.5% — the Quebec Abatement isn't modeled.~~
  **Fixed.** Found during a review pass that sanity-checked every province's top combined
  marginal rate against well-known published figures: 11 of 13 matched almost exactly, but
  Quebec came out at 58.75% against a commonly-cited real figure of ~53.3%. The
  [Quebec Abatement](https://www.canada.ca/en/department-finance/programs/federal-transfers/quebec-abatement.html)
  is a real, official 16.5-percentage-point reduction of *federal* tax payable for Quebec
  residents (Quebec opted out of certain federal programs decades ago and runs its own — QPIP,
  RAMQ drug coverage, subsidized daycare — in exchange for this abatement).

  This needed a new mechanism — neither `supersedesParent` (replace) nor `deductionsCredits`
  (flat/phasing dollar amount) can express "take a percentage off whatever an ancestor
  component computed to." `TaxComponent` now has an optional `abatement: { targetName, rate }`
  (src/data/schema.ts): `computeTax` looks up the already-computed same-`type` ancestor
  component named `targetName` and pushes a new component whose `amount` is
  `-(rate × target.amount)` — a negative line item that nets against the target's `type` total
  rather than replacing or stacking flatly. `data/ca/qc/2026.json` now has a `"Quebec
  Abatement"` component targeting `"Federal income tax"` at `rate: 0.165`.

  Verified against the engine, not just hand math: Quebec's top marginal income tax rate now
  computes to exactly **53.31%**, matching the well-known published figure precisely (was
  58.75% before the fix). Quebec's effective rate at $75k dropped from an outlier 31.95% to
  29.91%, now sitting naturally within the other provinces' 24–30% band. See the two
  abatement-specific tests in `computeTax.test.ts`, including one that recomputes at a second
  income to confirm the rebate scales proportionally rather than being a static number.

- ~~The federal "Canada employment amount" (line 31260), a non-refundable credit every
  employee gets automatically, wasn't modeled at all.~~ **Fixed.** Found by comparing this
  app's Ontario numbers against Wealthsimple's and TurboTax's public calculators at $100k
  income: Wealthsimple's own methodology text explicitly lists the Canada employment amount
  as one of the credits it applies, and its take-home was consistently higher than ours by
  roughly the size of that credit. `data/ca/2026.json`'s federal `"Federal income tax"`
  component now has a `"Canada employment amount"` credit of **$210.14** — $1,501 (the 2026
  indexed maximum, sourced from
  [TaxTips.ca](https://www.taxtips.ca/filing/canada-employment-amount-tax-credit.htm) since
  CRA's own line-31260 page returned a 403 to direct fetching, same as the Quebec 403 noted
  above) × the federal lowest marginal rate (14% for 2026, matching the first bracket in
  `data/ca/2026.json`).

  **Modeling simplification**: the real credit is the *lesser of* employment income or
  $1,501 — it only partially applies to someone with less than $1,501 of employment income
  for the year. This app's `income` input isn't tagged by income type (employment vs. other),
  and realistic incomes for this tool are always well above $1,501, so it's modeled as a flat
  credit (same convention as the basic personal amount credits above) rather than a true
  income-capped formula. Revisit if the app ever supports very low incomes precisely.

- ~~Ontario's provincial surtax — a 20%/36% two-tier surcharge on Ontario tax *payable*
  (not income) above $5,818/$7,446 — wasn't modeled at all.~~ **Fixed.** Found while checking
  every province against Wealthsimple's calculator: at $100k income Ontario is well above
  both surtax thresholds, and Wealthsimple's own page explicitly states it does *not* include
  the surtax, which is why adding it moves this app's Ontario number *further* from
  Wealthsimple's, not closer — Wealthsimple undercounts real Ontario tax at this income level.
  Verified against [TaxTips.ca](https://www.taxtips.ca/taxrates/on.htm)'s combined
  federal/Ontario rate tables (checked the raw page content directly — AI-summarized fetches
  of this specific page garbled the two-tier 2026 numbers, mixing up the 20%/36% rates and
  thresholds, so don't trust a summarized re-fetch of this page without spot-checking the raw
  HTML) and cross-checked that Ontario is the *only* one of the 13 provinces/territories with
  a surtax — none of the others mention one on their TaxTips.ca rate pages. PEI repealed its
  former surtax in an earlier bracket reform and has none for 2025/2026.

  This needed a new mechanism: `abatement` only supports a single flat rebate rate, but the
  surtax is genuinely progressive (20% on the tax between $5,818–$7,446, then *56% combined*
  above $7,446 — the 36% stacks on top of the 20%, it doesn't replace it). `TaxComponent` now
  has an optional `surtax: { targetName, brackets }` (`src/data/schema.ts`) that reuses the
  same `TaxBracket[]` shape as ordinary income brackets, but `computeTaxFromChain` applies
  those brackets to the *target's already-computed dollar amount* (via `taxFromBrackets`)
  instead of to income — the mirror image of `abatement`, which is why a 3-bracket schedule
  `[0–5818: 0%, 5818–7446: 20%, 7446+: 56%]` correctly reproduces the stacking two-tier
  surtax (verified by hand: this is algebraically identical to "20% of tax over $5,818 + 36%
  of tax over $7,446" for any tax amount above $7,446). `data/ca/on/2026.json` has a new
  `"Ontario surtax"` component targeting `"Ontario income tax"`.

  **Not yet modeled**: the Ontario Health Premium (up to ~$900/year, a step function with
  short phase-in ramps between flat plateaus based on taxable income — structurally different
  from both a marginal-bracket tax and a flat surtax on tax payable, so it doesn't fit either
  existing mechanism) is still missing. Wealthsimple's page confirms it doesn't model this
  either. Needs its own piecewise-step calculation mechanism if added later.

## US: schema extensions and modeling decisions

Two new fields on `TaxComponent` were needed to represent state-specific tax properties
accurately (both generic, not US-specific — added to `src/data/schema.ts`):

- **`floor` became filing-status-aware** (`number | Partial<Record<FilingStatus, number>>`,
  same shape as deduction/credit `amount`). Needed for the **Additional Medicare Tax**: a real
  0.9% federal payroll tax whose threshold varies by filing status ($200,000 single/HoH,
  $250,000 MFJ, $125,000 MFS — the MFS threshold is a deliberate anti-avoidance feature, not
  half of MFJ). `data/us/2026.json` models it as its own payroll component with a keyed
  `floor` and no `cap`, reusing the exact mechanism already built for CPP2. Verified: it
  triggers correctly at $200k for single filers, at the *lower* $125k threshold for MFS, and
  not at all for a single filer at $150k — see `computeTax.test.ts`.
- Confirmed the existing `surtax`/`abatement` mechanisms (built for Ontario/Quebec) weren't
  needed for any US state — Massachusetts's "Fair Share Amendment" and California's mental
  health services tax, the two most-cited state "millionaire surtaxes," are both already
  expressed as ordinary additional brackets in Tax Foundation's table (not a tax-on-tax
  surcharge like Ontario's), so plain `brackets` covers them with no new mechanism.

**Federal married-filing-separately (MFS) brackets are exactly half of MFJ's thresholds at
the same rates** — this is a real, legislated IRS rule (not an approximation), confirmed by
the top bracket starting at exactly `$768,700 / 2 = $384,350` for MFS, notably *lower* than
single's `$640,600` top-bracket start. This means MFS filers hit the top rate sooner than
single filers by design (a deliberate feature discouraging separate filing), so MFS was
computed from real MFJ figures rather than sourced separately from the IRS.

**State-level head-of-household and married-filing-separately brackets are an approximation,
not sourced data.** Tax Foundation's table only publishes single and married-filing-jointly
columns per state — no state-by-state HoH or MFS breakdown exists in the source. Every state
that differentiates single from MFJ (i.e., isn't a flat/no-tax state) has its HoH and MFS
brackets set to a *copy of its single brackets* — matching the common real-world convention
where a state's own filing instructions direct separate/head-of-household filers to use the
same table as single filers, which is a more defensible default than mechanically halving MFJ
(that's the *federal* rule, not a general state one — Delaware, Missouri, Virginia,
West Virginia, Rhode Island, and South Carolina, for example, don't scale their brackets for
marriage at all, so halving MFJ for MFS in those states would be wrong). States that don't
differentiate single from MFJ at all (every genuinely flat-rate state, plus several graduated
states whose law doesn't scale brackets by marital status — Delaware, Missouri,
Rhode Island, South Carolina, Virginia, and West Virginia among them) use a single flat
bracket array with no filing-status keying, so this approximation doesn't apply to them at
all. Standard deduction/personal exemption
amounts follow the identical convention: keyed single/MFJ where the state's own values differ,
with HoH/MFS copied from single.

**Nine jurisdictions have no state-level income tax component**: Alaska, Florida, Nevada,
South Dakota, Tennessee, Texas, Wyoming, New Hampshire (repealed its interest/dividends tax as
of 2025 — genuinely zero income tax now), and **Washington**, which is modeled as having no
general wage income tax even though it technically has one: Washington's tax applies only to
*capital gains* income above a high threshold (graduated up to 9% on gains over $1M as of a
2025 law change), not to wages. Since this app models tax against a single `income` figure
without distinguishing income type, and the overwhelming majority of any realistic user's
income in a comparison tool like this is wages, treating Washington as having no income tax is
more accurate for this tool's purpose than applying a capital-gains-only rate to ordinary
income would be. Alaska and New Hampshire have no state-level JSON file at all (not even a
sales-tax-only one, since both have 0% state sales tax) — `loadSnapshotChain` naturally falls
back to federal-only for them, which is the correct real-world outcome, not a workaround.

**Deliberately not modeled, given the scale (51 jurisdictions) and the instruction to be
accurate "as is feasible" rather than exhaustive:**
- **Municipal/local income tax** — already flagged as future work in
  [docs/data.md](../docs/data.md)'s municipal-tax section (Ohio, Pennsylvania, Maryland,
  Indiana all have hundreds of local jurisdictions with their own income tax; NYC's local tax
  is large enough to matter on its own). Still out of scope here; this pass is state-level only.
- **Standard deduction/personal exemption phase-outs for high earners.** A large number of Tax
  Foundation's footnotes describe income-based phase-outs of a state's SD/PE (e.g. Ohio's
  personal exemption drops in steps above $40k/$80k/$500k AGI; Maine, Minnesota, New York, and
  several others phase out standard deductions or exemptions above various thresholds). Every
  state's SD/PE is modeled as a flat, non-phasing amount — the single largest simplification in
  this pass, mirroring the same triage decision made for Canadian provincial BPA phase-outs
  (only the ones a source explicitly and prominently flagged were modeled there; here, given
  the sheer number of footnoted exceptions across 51 jurisdictions, none were).
- **Dependent exemptions/credits** — the app takes a single income figure with no household
  composition input, so per-dependent amounts (present in Tax Foundation's data for most
  states) aren't applicable and were excluded entirely, consistent with the user's own
  framing that family-size-dependent factors are out of scope for this tool.
- **State-specific payroll-style taxes outside ordinary income tax** — Washington's 0.58%
  WA Cares long-term-care payroll tax and Massachusetts's Paid Family and Medical Leave tax
  (0.46%+ employee-paid) are both real, both excluded from the state's `brackets`/`flatRate`
  data by Tax Foundation's own table (their footnotes say so explicitly), and not added here.
- **Alternative Minimum Tax (AMT)**, state "tax benefit recapture" provisions (Connecticut,
  New York), and other narrow high-income clawback mechanisms are not modeled.
- A handful of states' 2026 figures reflect **carried-forward 2025 inflation adjustments**
  rather than finalized 2026 ones, per Tax Foundation's own footnotes (e.g. California,
  Arkansas) — noted in their source but not specially flagged per-state here the way Quebec's
  unconfirmed brackets were, since this is Tax Foundation's normal annual publication caveat
  rather than a first-party "not yet confirmed" flag.

~~Enabling the US in the app: blocked on a missing map asset.~~ **Fixed in a later pass.**
`public/maps/us-states.json` now exists and `src/countries/us.ts` is `enabled: true`.

## UK: deliberately not modeled

- **Council Tax** — the UK's local property tax, set per-property-band by each of hundreds of
  local authorities. Deferred for the same reason municipal/property tax is deferred everywhere
  else in this app (see the municipal-tax section of docs/data.md) — `TaxComponentType` has a
  `"property"` variant in the schema, but no jurisdiction in this app populates one yet.
- **Marriage Allowance** — a small transferable-Personal-Allowance mechanism (up to £1,260/year)
  available only to couples where the lower earner is below the Personal Allowance threshold.
  Excluded along with all other household-composition-dependent amounts, consistent with the
  user's own framing (also applied to US dependent exemptions and Canadian per-dependent
  amounts) that family-size-dependent factors are out of scope for this tool.
- **Student loan repayments** — a real payroll-style deduction for UK graduates (9% above an
  income-contingent threshold, varying by loan "Plan" type), but conditional on personal
  borrowing history rather than a universal feature of every taxpayer's situation, so it's
  excluded the same way this app excludes anything conditional on individual circumstances
  rather than jurisdiction alone.
- **Dividend and savings income allowances/rates** — Income Tax on dividends (8.75%/33.75%/
  39.35%) and the Personal Savings Allowance are entirely different rate schedules that only
  apply to non-employment income. Since this app's single `income` input is treated as
  employment income everywhere else (the same assumption applied to Mexico's IMSS SBC proxy and
  Canada's payroll wage bases), modeling a second parallel rate schedule for a type of income
  this tool doesn't ask about would be inconsistent with how every other jurisdiction is treated.
- **Scottish Income Tax on savings/dividend income** — not applicable regardless of the above,
  since savings and dividend income tax is reserved to Westminster even for Scottish taxpayers
  (only *earned* income uses the Scottish bands) — noted here only so it isn't mistaken for an
  oversight.

## France: deliberately not modeled

- **The décote** — a genuine additional tax reduction for low/middle incomes, `897€ − 45.25% ×
  impôt brut` for a single filer (i.e. it shrinks the *already-computed* Impôt sur le revenu
  amount, reaching zero once gross tax exceeds ~€1,982). This is self-referential in a way neither
  `abatement` (a flat % of a *different* already-computed component) nor `surtax` (progressive
  brackets applied to a target's amount, always increasing it) can express — it needs a new
  "linear rebate against this same component's own output" mechanism. Given it only binds within
  a narrow band near the bottom of the second bracket (roughly up to ~€29,600 of taxable income,
  right where the 11% bracket's own cumulative tax first exceeds the décote's own breakeven
  point), a new mechanism for one narrow low-income edge case was judged disproportionate to this
  pass — the same triage call as skipping the UK's Marriage Allowance or Ontario's Health Premium.
- **The DROM income-tax abatement** — a real 30% (Guadeloupe/Martinique/Réunion) or 40%
  (Guyane/Mayotte) reduction of Impôt sur le revenu for DROM residents, capped at a fixed euro
  amount (historically around €2,988/€4,343). This app's `abatement` mechanism supports the flat
  percentage but has no cap parameter — and modeling it *without* the cap would overstate the
  benefit for most realistic incomes this app targets (the cap binds once 30% of gross tax
  exceeds ~€2,988, i.e. around a taxable income in the €45–50k range for a single filer, well
  within this app's curated income levels), which would be actively misleading rather than a
  narrow-edge-case simplification. Left unmodeled rather than implemented incorrectly; a capped
  variant of `abatement` would need a schema extension (`abatement.cap`) to do this properly.
- **Corsica's own local tax specificities** (a handful of narrow historical exemptions/reduced
  rates tied to Corsican statutory status) are not modeled — Corsica is treated as an ordinary
  région with mainland-rate TVA and no income-tax variance, which is correct for income tax (no
  Corsican income-tax variance exists) but is a simplification for a few minor Corsica-specific
  provisions this pass didn't attempt to catalog.
- **Taxe foncière / taxe d'habitation** (local property tax, set per-commune) — deferred for the
  same reason as UK Council Tax and US/Canadian municipal property tax: this app has no
  jurisdiction populating a `"property"`-type component yet.
- **Self-employed ("indépendant"/micro-entrepreneur) contribution rates** — this app models the
  standard private-sector salarié case throughout (the same default used for US FICA, Canadian
  CPP/EI, UK NI, and Mexican IMSS); France's self-employed contribution schedule is structurally
  different (URSSAF's "travailleurs indépendants" rates, not Agirc-Arrco/CSG-CRDS as modeled
  here) and out of scope.

## Japan: deliberately not modeled

- **The one-year lag on 住民税** — real resident tax is assessed on the *previous* year's income,
  not the current year (already called out above, repeated here since it's the single largest
  Japan-specific simplification): a new hire's first year genuinely has ~¥0 resident tax, with a
  real, well-known payroll "shock" the following year. This app has no prior-year-income concept
  for any country, so current income is used directly, the same convention applied everywhere
  else.
- **均等割** (the flat ¥5,000/year per-capita portion of resident tax: ¥4,000 prefectural/municipal
  + ¥1,000 national 森林環境税) — a fixed yen amount, not a percentage of income, so it doesn't fit
  any of this app's rate-based mechanisms. At ¥5,000/year it's immaterial next to every other
  component modeled here and was left out rather than forcing a schema change for it.
- **介護保険** (nursing-care insurance, ages 40–64 only) — a real, sizeable add-on to health
  insurance (roughly another 1.6%, split employee/employer) excluded as age-conditional,
  consistent with excluding every other age/dependent-conditional amount in this app.
- **配偶者控除 / 扶養控除** (spousal/dependent deductions) — excluded along with every other
  household-composition-dependent amount in this app (US dependent exemptions, Canadian
  per-dependent credits, UK Marriage Allowance).
- **Industry-specific 雇用保険/労災保険 rates** — agriculture/forestry/fisheries/sake-brewing and
  construction have their own higher 雇用保険 employee rates (0.6% vs. the modeled 0.5% general
  rate); 労災保険 (workers' compensation) is 100% employer-paid and out of scope entirely,
  consistent with excluding every other employer-only contribution in this app (US/Canada/UK
  employer-side payroll taxes).
- **National Health Insurance (国民健康保険)** for the self-employed/unemployed, and 組合健保
  (company-specific health insurance unions, which can differ from Kyokai Kenpo's prefecture
  rates) — this app models the Kyokai Kenpo baseline, the standard case for employees at small/
  mid-size companies without their own health insurance union, the same "most common employment
  arrangement" assumption applied to every other country's payroll modeling here.
- **Dividend/capital-gains-specific rates** (分離課税 — a flat ~20.315% on investment income,
  entirely separate from the progressive 所得税 schedule modeled here) — out of scope for the
  same reason the UK's dividend/savings rates are: this app's single `income` input is treated as
  employment income everywhere.

## Greenland: deliberately not modeled

- **Fully up-to-date 2026 deduction amounts** — Personfradrag (kr. 60,000), Standardfradrag
  (kr. 10,000), and Beskæftigelsesfradrag's cap/phase-out thresholds are the most recent
  independently-confirmed figures (an October 2025 official guide), not a freshly-published
  2026-specific figure the way the municipal tax *rates* were (confirmed live from Aka's current
  rates page). Personfradrag is set annually by Inatsisartut and may have been re-indexed by a
  small amount for 2026 that wasn't independently confirmed this pass — hence `precision:
  "estimated"` on every Greenland component.
- **The "outside municipal areas" 36% rate** — Aka's own rate table includes a residual category
  for taxpayers outside the 5 municipalities' boundaries (a handful of remote settlements/
  scientific stations). Not modeled since it isn't one of the 5 real municipal jurisdictions this
  app's map/jurisdiction data represents.
- **AMA (Arbejdsmarkedsafgift)** — confirmed employer-only (see above) and excluded, consistent
  with every other employer-only levy in this app.
- **Narrow excise/import duties** (indførselsafgifter on alcohol, tobacco, vehicles, etc.) — the
  closest thing Greenland has to a consumption tax, but category-specific rather than a broad
  rate, out of scope for the same reason the UK/France/Mexico/Japan's reduced/category-specific
  consumption rates are.
- **Household-composition amounts** (e.g. married-couple joint taxation nuances) — excluded along
  with every other household-composition-dependent amount in this app.
- **Property tax** (grundskyld-equivalent, if any) and any municipal-level fees beyond the income
  tax modeled here — out of scope for the same reason property tax is deferred everywhere else
  in this app.

## Brazil: deliberately not modeled

- **IRPFM (Imposto de Renda Pessoa Física Mínimo)** — the new alternative-minimum-style tax
  Lei 15.270/25 also introduced, applying only above R$600,000/year of *total* income
  (salary + dividends + rents + capital gains combined) and reaching a maximum 10% only above
  R$1.2 million/year. Excluded because it fundamentally requires aggregating income types this
  app doesn't model (a single `income` figure, treated as salary throughout) — the official FAQ
  itself notes it affects only ~141,400 taxpayers (0.13% of filers), almost none of whom are
  represented by a pure-salary input anyway.
- **10% dividend tax** (also new for 2026, on dividends above R$50,000/month) — out of scope for
  the same reason as IRPFM and the UK/Japan's dividend-specific rates: this app's `income` is
  treated as salary, not investment income, everywhere.
- **FGTS** (Fundo de Garantia do Tempo de Serviço, 8% of salary) — entirely employer-paid into an
  account nominally the employee's, excluded as employer-only, consistent with every other
  employer-only contribution in this app (US FUTA, Greenland's AMA, etc.).
- **PIS/COFINS** — federal contributions on business gross revenue, embedded in consumer prices
  rather than withheld from an employee's own paycheck; out of scope the same way employer-side
  levies are everywhere else.
- **The CBS/IBS transition (Reforma Tributária, EC 132/2023)** — 2026 is the first year of
  Brazil's multi-year consumption-tax overhaul that will eventually replace ICMS/ISS/PIS/COFINS
  with two new taxes (CBS, IBS), but 2026 itself only levies them at token "test" rates alongside
  the existing taxes at nearly full strength — so ICMS remains the right tax to model for what
  someone actually pays in 2026. Revisit as CBS/IBS phase in and ICMS phases out over the
  following years.
- **Household-composition amounts** (per-dependent deductions) — excluded along with every other
  household-composition-dependent amount in this app.
- **IPVA** (vehicle property tax) and other narrow state-specific levies — out of scope for the
  same reason property tax is deferred everywhere else in this app.
