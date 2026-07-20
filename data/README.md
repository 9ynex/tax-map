# Tax Data

Layout mirrors the jurisdiction hierarchy: `/data/{...ancestorSlugs}/{taxYear}.json`. Each
file is a `TaxYearSnapshot` for exactly one jurisdiction (see
[src/data/schema.ts](../src/data/schema.ts)). `jurisdictions.json` is the hierarchy manifest —
id, display name, level, parent — and doesn't change per tax year.

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

**Enabling the US in the app**: `src/countries/us.ts` still has `enabled: false`. That flag's
own comment says flipping it on is meant to be the whole remaining step once data is verified
— the data now is, but **the map asset it needs, `public/maps/us-states.json`, doesn't exist**
(only `ca-provinces.json` is present). Flipping `enabled: true` without it would break the
country page's map. That's a distinct piece of work (sourcing/building US state topology data)
outside the scope of this data pass, so it's left as the explicit next step rather than done
here.
