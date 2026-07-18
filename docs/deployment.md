# Hosting, Deployment & Maintenance

## Hosting & deployment

**Vercel** is the primary recommendation — built by the Next.js team, so App Router SSG/ISR,
`next/og` image generation (planned in [seo.md](seo.md) for shareable comparison cards), and
edge caching for the static tax JSON (per [data.md](data.md)'s caching section) all work with
zero config. Git-push-to-deploy, automatic preview deployments per PR, free Hobby tier covers
everything until there's real traffic.

**Know the exit ramp.** Vercel's serverless function invocations, image optimization, and
bandwidth can get expensive at scale in a way that catches teams off guard during traffic
spikes — a real risk here specifically, since the SEO strategy is aiming for exactly that kind
of spike. If a traffic spike ever produces a surprising bill before ad revenue catches up,
**Cloudflare Pages + Workers** is the credible alternative (Next.js-compatible via their
adapter, no egress fees, cheaper at high bandwidth). Not needed now — just worth knowing
before it becomes an emergency.

**DNS**: put the domain on Cloudflare regardless of where it's hosted — free, fast, trivial to
point at Vercel, and gives a ready migration path if the host ever changes.

## Prerequisite: version control

Nothing below works without a git repo. The data-update workflow in [data.md](data.md)
explicitly assumes PR-based review, and Vercel's deploy model is git-push-based. Initializing
git and pushing to a GitHub repo connected to Vercel is the first concrete implementation
step, ahead of any code.

## CI/CD & environments

- **GitHub** as the repo host, **Vercel's GitHub integration** for deploys: push to `main` →
  production, every PR → its own preview URL.
- No separate staging environment needed at this size — PR previews cover it, including
  visually reviewing next year's tax data change (see below) before it goes live, not just as
  a JSON diff.

## Automating the annual data update

[data.md](data.md)'s update workflow (fetch → parse → diff → PR → human review → merge)
should run as a **GitHub Action**, not a manual local script:
- Scheduled trigger around when most tax authorities publish next year's numbers (roughly
  Nov–Jan for both the IRS and CRA), plus a manual trigger for off-cycle mid-year adjustments.
- Opens a PR with the data diff. The Vercel preview deployment on that PR lets you see next
  year's numbers rendered before merging — a safety net a bare data diff doesn't give.
- **A Vitest suite validating `computeTax()` against known official worked examples** for each
  jurisdiction/tax year, run in CI on every PR. This is the highest-leverage maintenance
  investment given the calculation engine is a pure function (cheap to test exhaustively) and
  given wrong numbers are the fastest way to undermine the trust/E-E-A-T signals planned in
  [seo.md](seo.md).

This turns "maintenance" into a once-or-twice-a-year PR review rather than an ongoing
engineering burden — the entire premise of the static-JSON strategy in data.md.

## Monitoring & observability

- **Google Search Console** — non-negotiable given the SEO-first strategy: submit the
  sitemap, track which programmatic pages get indexed/impressions/clicks, catch crawl errors
  early.
- **Vercel Analytics** or **Plausible** for traffic — privacy-friendly, and Plausible's data
  is what ad networks like Mediavine typically want to see on application.
- **Sentry** (free tier) for client-side error tracking — catches calculation-engine or React
  errors in production that unit tests didn't cover.

## Cost summary

Everything above runs at **$0/month** until there's meaningful traffic — Vercel Hobby,
Cloudflare DNS, GitHub, Search Console, Plausible/Vercel Analytics, and Sentry all have
workable free tiers. The domain (~$10–15/year) is the only real unavoidable cost. This matches
the ethos already set in data.md: no infrastructure to maintain or pay for until growth
actually demands it, and by the time the free tiers are outgrown, traffic is likely also at
the level where ad revenue (or a Vercel Pro upgrade) is a "good problem to have."

## Standing item: disclaimer

A visible disclaimer ("estimates only, not tax advice") belongs on every page from day one —
standard practice for this category of tool, and consistent with the About/methodology page
already planned in seo.md for E-E-A-T. Bake it into the page template now rather than
retrofitting it later.
