# Frontend Stack & UX Strategy

## Framework & language

**Next.js (App Router) + TypeScript.** The data strategy in [data.md](data.md) serves
static JSON cached at the edge, so Next.js gives free SSR/SSG for fast first paint and lets
organic search traffic in (e.g. "Texas vs California taxes") — a real acquisition channel for
a comparison tool like this. TypeScript lets the `Jurisdiction`/`TaxComponent` types from the
data schema flow straight through into the UI and calculation engine with no drift.

## UI component layer

**shadcn/ui + Tailwind CSS**, not a heavier opinionated kit (Chakra, Mantine, MUI). shadcn is
copy-into-your-repo Radix primitives — unstyled logic, zero visual lock-in — which matters
because a strong custom visual identity means not looking like every other SaaS dashboard
built on the same default theme. Accessible primitives (dialogs, drawers, tooltips, sliders)
come for free, styled from scratch on top.

## Animation layer

**Framer Motion (`motion/react`)** is the highest-leverage pick for the "flashy" goal:
- `layoutId` shared-element transitions for "click a region and it expands into detail" — the
  region visually morphs into the panel instead of a panel just appearing.
- `useSpring`/`animate` for count-up number animations when income changes or a region is
  swapped — cheap to build, high perceived polish. Tax dollar figures should never just snap
  to a new value.
- Gesture support for the income slider and map hover/press states.

## Map & data visualization

- **react-simple-maps** (d3-geo + TopoJSON) for the choropleth — standard choice for
  interactive US-state/Canada-province maps, composes well with SVG + Framer Motion for
  hover/click animation.
- For the breakdown panel (stacked bar, waterfall, donut): skip an out-of-the-box chart
  library. **visx** (low-level d3+React primitives) or hand-rolled SVG driven by Framer Motion
  will look distinctive; generic dashboard chart libraries (Recharts/Tremor-style) cut against
  the design goal.
- **Zustand** for transient UI state only — hover, in-flight animation, view-toggle
  mid-transition. Income, country, and pinned regions live in the URL, not the store (see
  below). No React Query needed since there's no server truth beyond a static data fetch.

## UX arrangement

Core loop: income in → map colored by result → click a region to expand full detail.

1. **URL is the source of truth for income, country, and pinned regions.** Selecting an
   income, switching country, or pinning a region for comparison all update the URL, so every
   meaningful view stays shareable and bookmarkable (see [seo.md](seo.md)). Zustand is
   reserved for state that shouldn't be shareable (hover, animation-in-progress).

2. **Income input is the hero, not a form.** Slider + typed value in sync, front and center,
   map live beneath it. No separate landing page — get to a number within one interaction.
   `/` still renders with a sensible default (national median income) rather than an empty
   state, so the root URL — normally a site's highest-authority page — has real content for
   both first-time visitors and search engines.

3. **Color the map by effective rate (%), not raw dollars.** Income is fixed by the user's own
   input, so % effective tax rate is the actually-comparable metric across regions. Offer a
   toggle between % rate / total tax $ / take-home $; the color scale morphing on toggle is
   itself a nice moment.

4. **Click → shared-element expansion, not a modal popping in.** Use `layoutId` so the clicked
   region grows into the detail panel (side drawer on desktop, bottom sheet on mobile). Inside:
   a waterfall from gross income → deductions → taxable income → tax owed → net take-home,
   animated bar-by-bar. This builds trust as well as polish — a bare final number is easy to
   distrust, a visible breakdown isn't. Any line item with `precision: "estimated"` (per
   [data.md](data.md)) gets a small badge/tooltip ("estimated") rather than being presented
   with the same confidence as a statutory rate.

5. **Build comparison in from day one.** The stated purpose is comparing regions, so clicking
   should *pin* a region ("2 selected — compare" bar appears) rather than only ever showing one
   at a time. Side-by-side breakdown is likely the single most valuable screen in the app. Per
   [data.md](data.md), v1 only allows pinning jurisdictions that share a currency (no
   USD-vs-CAD comparison yet) — the UI should disable or hide cross-currency pinning rather
   than silently producing a meaningless comparison.

6. **Map defaults zoomed in, not a full-country overview.** Mobile touch targets make small
   states/provinces (Rhode Island, Delaware, PEI) unusable at a full-map zoom level, so the
   default view is zoomed enough that every region is comfortably tappable, with pan/zoom to
   see the rest. This is a client-side rendering preference only — it must not change the
   server-rendered content of a page per visitor. Regardless of map zoom/pan state, every
   region and comparison page must also be reachable through a real link (the List view, or a
   footer/index page) — see [seo.md](seo.md) for why this matters for crawlability, and it
   will double as the accessibility fallback whenever that work is prioritized (currently
   deferred post-v1).

7. **Land area still has zero correlation with tax rate** even once the map is zoomed in by
   default — worth keeping the **hex-cartogram** and **sortable list** views (point 6) as
   alternate modes (Map / Hex / List) for both the "size implies nothing" distortion and as
   the precision/power-user path.

8. **Progressive disclosure on inputs.** Primary: income and country. Filing status is
   *not* a primary input — per [data.md](data.md) it doesn't apply uniformly across
   jurisdictions (Canada has no federal joint filing), so it only appears as a secondary
   input once the user has drilled into a jurisdiction where it's relevant. Other secondary
   inputs (dependents, itemized deductions, home value for the property-tax estimate) sit
   behind the same "advanced" toggle, updating the result live rather than gating it behind a
   full form — pairs naturally with the calculation engine being a pure client-side function.

9. **Dark-mode-first.** Fintech/data-viz tools in this genre default dark for a premium feel,
   and it meaningfully changes map color-scale design — worth deciding now rather than
   retrofitting.

10. **Never hardcode the tax year in UI copy.** "Tax Year" badges, page headers, etc. read
    from the data's `taxYear` field (per [data.md](data.md)) so they advance automatically
    when the annual data update lands, rather than needing a separate copy pass.
