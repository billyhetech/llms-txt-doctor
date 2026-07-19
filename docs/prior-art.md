# Prior art — llms.txt tooling landscape (researched 2026-07-19)

Surveyed before writing code (per research-before-build rule). Sources: npm
registry + GitHub API + web search, numbers as of 2026-07-19.

## The landscape in one line

**Build-time framework plugins won; crawl-based standalone CLIs all have
near-zero traction; validators are crowded but are all lead-gen web tools plus
one OSS CLI.**

## Category 1 — Spec + reference tooling

| Tool | Traction | Notes |
|---|---|---|
| [AnswerDotAI/llms-txt](https://github.com/AnswerDotAI/llms-txt) | 2,513★ | The spec itself (llmstxt.org) + Python `llms_txt2ctx` context expander. Actively updated. |

## Category 2 — Framework plugins (the actual winners)

| Tool | Traction | Why it wins |
|---|---|---|
| [vitepress-plugin-llms](https://github.com/okineadev/vitepress-plugin-llms) | 377★, ~15k dl/wk, used by Vue/Vite/Vitest | Generates from **source markdown at build time** — perfect content quality, zero crawling. Emits llms.txt + llms-full.txt. |
| [docusaurus-plugin-llms](https://github.com/rachfop/docusaurus-plugin-llms) | 137★ | Same model for Docusaurus; batch processing for big sites. |
| [get-llms-txt](https://github.com/romankurnovskii/get-llms-txt) | ~15k dl/wk (recent, possibly inflated) | Local MD/MDX dir → llms.txt, Next.js-flavored. CLI + API. |

Lesson: quality comes from source files, not scraping. Any crawler is a
fallback for sites you don't own the source of.

## Category 3 — Crawl-based generators (crowded, no winner)

| Tool | Traction | Approach |
|---|---|---|
| [firecrawl/llmstxt-generator](https://github.com/firecrawl/llmstxt-generator) | 532★ but **deprecated 2025-06** | Firecrawl crawl + GPT-4o-mini summaries. Needs 3 API keys self-hosted. Stars came from Firecrawl's brand; was a demo for their API. |
| [@ammit/llms-txt](https://github.com/ammit/llms-txt) | 1★, 3 dl/wk | Best OSS crawler UX: sitemap→link-follow hybrid discovery, Readability+Turndown extraction, include/exclude, rate limiting, robots-parser. Nobody found it. |
| [llmoptimizer](https://www.npmjs.com/package/llmoptimizer) | 7 dl/wk | Framework-agnostic, cheerio-based. |
| [@imiagkov/llms-gen](https://www.npmjs.com/package/@imiagkov/llms-gen) | ~0 | Playwright-based (heavy). |
| Apify actor, MCP servers, hosted web generators (llms-txt.io, sitespeak.ai…) | n/a | Hosted lead-gen for GEO agencies. |

Lesson: "yet another crawler CLI" is a proven dead end for adoption. If we
ship one, the crawler is the commodity part; the wedge must be elsewhere.

## Category 4 — Validators / checkers

Crowded with **hosted web tools** (llms-txt.io/validator, llmstxtchecker.net,
Hostinger's llmstxtvalidator.org, mrs.digital, geordy.ai…) — every GEO/SEO
agency runs one as lead-gen. OSS CLI exists:
[bridgetoagent/llms-txt-validator](https://github.com/bridgetoagent/llms-txt-validator)
(spec conformance, link reachability, missing sections; CLI + JS lib).

Typical check dimensions: HTTP 200 as text, H1 title, blockquote summary, H2
sections, markdown links, link liveness, llms-full.txt presence.

## What's genuinely missing (our candidate wedges)

1. **generate + check in one zero-dep CLI.** Today generation and validation
   are separate tools; nothing does `npx llms-txt-doctor check` + `generate` with
   zero dependencies and zero API keys.
2. **Coverage check vs sitemap** — validators check the file in isolation;
   none answer "what % of your site does your llms.txt actually cover, and
   what's stale?"
3. **Bilingual / Chinese-market angle** — no tool handles zh/en sites
   (hreflang, /zh/ sections) or even mentions Chinese AI models. Matches
   SeenForAI positioning exactly. Honest caveat: no public evidence Doubao/Kimi
   crawlers fetch llms.txt at all.
4. **The data story** — running `check` across N category sites produces
   original stats ("X% of top SaaS sites have llms.txt, Y% malformed") —
   content-marketing value independent of tool adoption. Existing tools sit on
   this and don't publish.

## Expectation setting

The llms.txt hype peaked in 2025; a me-too generator in mid-2026 is late. Star
potential is modest. The realistic value: (a) an honest open-source artifact
for build-in-public, (b) a `check` command that generates original data for X
posts and funnels to seenfor.ai (checking what AI sees *is* the product).

## Patterns to borrow

- Hybrid discovery: robots.txt `Sitemap:` → sitemap.xml/index → homepage link
  crawl (@ammit).
- Dual output llms.txt / llms-full.txt naming convention (vitepress plugin).
- Check dimensions from bridgetoagent + the hosted validators, extended with
  coverage-vs-sitemap and bilingual checks.
- Firecrawl's lesson inverted: no API keys, no LLM dependency — meta
  descriptions are good enough for v0.1.
