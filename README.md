# llms-txt-doctor

Diagnose **and generate** [llms.txt](https://llmstxt.org/) files. One command,
zero config, zero dependencies, no API keys.

```bash
# Check a site's llms.txt — spec lint, dead links, sitemap coverage
npx llms-txt-doctor check example.com

# No llms.txt, or a broken one? Generate it
npx llms-txt-doctor generate example.com
```

## Why another llms.txt tool?

Most generators stop at generating. In practice the problems we kept seeing are
*after* that: files that return HTML because of SPA fallback routes, dead
links, an llms.txt that covers 5% of the site and never gets updated. So this
tool treats **checking as a first-class command**, not an afterthought:

- ✓ Spec structure: H1 title, `> summary`, `##` sections, link items
- ✓ Serving problems: 404s, HTML bodies, wrong content-type
- ✓ Link liveness (sampled, polite)
- ✓ **Coverage vs sitemap** — what % of your site does your llms.txt actually list?
- ✓ **Bilingual gap** — site has Chinese (`/zh/`) pages but llms.txt lists none
- ✓ `llms-full.txt` presence

And it's honest about scope: `generate` builds the *index* from your sitemap
(or homepage links as fallback) using titles + meta descriptions. If you own
the site's source, a build-time plugin like
[vitepress-plugin-llms](https://github.com/okineadev/vitepress-plugin-llms)
will produce richer content — use that. This tool is for sites you don't have
the source of, quick starts, and audits.

## Usage

### `generate <url>`

```bash
npx llms-txt-doctor generate example.com
npx llms-txt-doctor generate example.com --include /docs --include /blog --max-pages 80
npx llms-txt-doctor generate example.com --out - > llms.txt   # stdout
```

| Option | Default | |
|---|---|---|
| `--out <file>` | `llms.txt` | `-` for stdout |
| `--max-pages <n>` | 50 | page cap |
| `--concurrency <n>` | 5 | parallel fetches |
| `--include <prefix>` | — | repeatable path allowlist |
| `--exclude <prefix>` | — | repeatable path blocklist |
| `--all` | off | keep auth/pagination pages that are skipped by default |
| `--title` / `--description` | auto | override header lines |

Discovery order: `robots.txt` `Sitemap:` lines → `/sitemap.xml` /
`/sitemap_index.xml` (indexes followed) → homepage links. Same-origin only.

Output shaping (all automatic): auth flows and `/page/N` pagination are
skipped (`--all` keeps them), legal boilerplate lands in the spec's
`## Optional` section, and localized paths like `/zh/...` collapse into one
native-named section per language (e.g. `## 中文 (Chinese)`), sorted after the
default-language sections.

### `check <url>`

```bash
npx llms-txt-doctor check example.com
npx llms-txt-doctor check example.com --json   # for scripts/CI
```

Exit code 1 if any check fails — usable as a CI gate.

```
llms.txt check — https://example.com/

  ✓ /llms.txt found (text/plain, 4.2 KB)
  ✓ H1 title: "Example"
  ⚠ Missing `> summary` blockquote after the title
  ✓ 3 section(s), 42 link(s)
  ✓ Links alive: 20/20 checked
  ℹ Covers 42 of 180 sitemap URLs (23%)
  ⚠ Site has 60 Chinese page(s) in its sitemap but llms.txt lists none of them
  ℹ llms-full.txt: not found (optional)

  0 failed, 2 warning(s)
```

### Programmatic API

```ts
import { generateLlmsTxt, checkSite } from 'llms-txt-doctor';

const { content } = await generateLlmsTxt({ url: 'https://example.com' });
const report = await checkSite({ url: 'https://example.com' });
```

## Notes

- Node 18+. Zero runtime dependencies.
- The generator never invents content: titles and descriptions come from the
  pages' own `<title>` / `og:` / meta tags.
- Prior-art survey that shaped this tool: [`docs/prior-art.md`](docs/prior-art.md).

## Who's behind this

Built by [SeenForAI](https://seenfor.ai) — we track how AI models (ChatGPT,
Claude, Gemini, Perplexity, Doubao, Kimi, DeepSeek) describe brands. Checking
what AI actually sees is our whole thing; this is the open-source corner of it.
If you want to see how those models answer questions about *your* brand, the
[free checker](https://seenfor.ai/tools/ai-visibility-checker) runs without
signup.

## License

MIT
