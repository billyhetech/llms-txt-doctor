# Benchmark: 24 popular sites + 18-file corpus (2026-07-19)

Two datasets, gathered the same day:
- **Corpus**: llms.txt files from 18 known adopters (Anthropic, Stripe docs,
  Vercel, Cursor, PostHog, Zapier, Linear, …) — used to learn format patterns.
- **Benchmark**: 24 popular sites across industries (SaaS, e-commerce, media,
  travel, finance, marketing, design, education, entertainment) — each run
  through `check`, then `generate` (max 12 pages).

## Headline numbers

- **14/24 popular sites already serve an llms.txt** (GitHub, Stripe, Slack,
  Notion, PayPal, Salesforce, Shopify, Wix, HubSpot, Atlassian, Coinbase,
  Mailchimp, Webflow, Coursera). Adoption in mid-2026 is far past the
  "dev-docs only" phase.
- 10/24 don't (Airbnb, BBC, Booking, Canva, Etsy, Figma, Netflix, Nike,
  NYTimes, Spotify) — mostly media/e-commerce, consistent with weak incentive:
  they have schema.org data and don't want free scraping.
- Notably, some GEO vendors themselves return 404 on /llms.txt.

## Real-world defects `check` caught in the wild

| Site | Finding |
|---|---|
| Mailchimp | 512 KB full-content dump, zero markdown links |
| Coursera | 2.5 MB (!) dump, no H1, no links |
| Salesforce | 997 KB, 3,772 links, no H1, no sections |
| Webflow | 4 of 5 sampled links dead |
| Notion | No H1; 1,378 Chinese pages in sitemap, none listed |
| docs.claude.com | 2 dead links; 274 Chinese pages unlisted |

Pattern: big brands ship llms.txt but violate the spec's core shape
(index-with-links). The three failure archetypes: **full-content dump**
(Mailchimp/Coursera/Salesforce), **link rot** (Webflow), **bilingual gap**
(Notion). All three are exactly what `check` tests.

## Format patterns learned from the corpus (now implemented)

1. Everyone uses index style; llms-full.txt carries the bulk. (>100 KB warn
   validated: PostHog 433 KB, Vercel 193 KB are outliers, not the norm.)
2. `> summary` present in only ~60% — warn, not fail, is the right severity.
3. Cursor-style bare-URL bullets (`- https://…`) exist in the wild → parser
   now accepts them (was: counted 0 links).
4. `.md` mirrors per page (Cursor/Vercel) are the advanced practice → now
   surfaced as a positive info signal.
5. Docs-subdomain linking (github.com/llms.txt → docs.github.com) makes
   same-origin sitemap coverage understate → coverage message now notes it.

## Honest evaluation: is our `generate` better than the live files?

- **On sites you control** (the intended use): yes on structure. Our output
  has spec shape (H1 + summary + sections + described links), locale sections,
  noise filtering, boilerplate-description stripping. Live files at
  Mailchimp/Coursera/Salesforce scale fail basic lint.
- **On third-party bot-protected sites**: no. Cloudflare-class protection
  blocks our crawler (Netflix, Booking, Figma, …) — generation now fails
  loudly instead of writing a near-empty file. First-party generators (GitHub's
  API-driven llms.txt) will always beat external crawling — that's why
  `check` is the hero command, and `generate` is the bootstrap.

## Changes shipped from this benchmark

- Parse bare-URL list items; `.md` mirror detection (info)
- Boilerplate description stripping in generate
- Loud failure on 0-page generation (bot protection)
- Off-origin coverage annotation
- `--out -` flag parsing fix
