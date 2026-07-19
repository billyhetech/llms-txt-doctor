const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  reg: '®',
  trade: '™',
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code: string) => {
    try {
      if (code.startsWith('#x') || code.startsWith('#X')) {
        return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
      }
      if (code.startsWith('#')) {
        return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
      }
      return NAMED_ENTITIES[code] ?? match;
    } catch {
      return match;
    }
  });
}

function cleanText(raw: string, maxLength: number): string {
  const text = decodeEntities(raw).replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > maxLength * 0.6 ? lastSpace : maxLength)}…`;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Content of `<meta name|property="key" content="...">`, attribute order agnostic. */
export function metaContent(html: string, key: string): string | undefined {
  const tagRe = new RegExp(
    `<meta\\b[^>]*(?:name|property)\\s*=\\s*["']${escapeRegExp(key)}["'][^>]*>`,
    'i',
  );
  const tag = html.match(tagRe)?.[0];
  if (!tag) return undefined;
  const content = tag.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  const value = content?.[1] ?? content?.[2];
  return value?.trim() ? value : undefined;
}

export function extractTitle(html: string, siteName?: string): string | undefined {
  const raw =
    metaContent(html, 'og:title') ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!raw) return undefined;
  let title = cleanText(raw, 120);
  // Strip trailing " | Site" / " – Site" style suffixes when they just repeat the site name.
  if (siteName) {
    const suffixRe = new RegExp(`\\s*[|\\-–—·:]\\s*${escapeRegExp(siteName)}\\s*$`, 'i');
    const stripped = title.replace(suffixRe, '').trim();
    if (stripped) title = stripped;
  }
  return title || undefined;
}

export function extractDescription(html: string): string | undefined {
  const raw = metaContent(html, 'description') ?? metaContent(html, 'og:description');
  if (!raw) return undefined;
  const description = cleanText(raw, 200);
  return description || undefined;
}

export function extractSiteName(html: string): string | undefined {
  const raw = metaContent(html, 'og:site_name');
  return raw ? cleanText(raw, 80) : undefined;
}

const NON_PAGE_RE =
  /\.(png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|map|json|xml|txt|zip|gz|tgz|tar|rar|mp4|mp3|wav|mov|woff2?|ttf|otf|eot|pdf|docx?|xlsx?|pptx?)$/i;

/** Same-origin page links from anchor tags, absolute, deduped, no hash/query. */
export function extractLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const found = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const href = (match[1] ?? match[2] ?? '').trim();
    if (!href || href.startsWith('#') || /^(?:mailto|tel|javascript|data):/i.test(href)) continue;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.origin !== base.origin) continue;
    if (NON_PAGE_RE.test(url.pathname)) continue;
    url.hash = '';
    url.search = '';
    found.add(url.toString());
  }
  return [...found];
}

/** `<loc>` values from a sitemap or sitemap index. */
export function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((m) => decodeEntities((m[1] ?? '').trim()))
    .filter(Boolean);
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  return isIndex ? { urls: [], sitemaps: locs } : { urls: locs, sitemaps: [] };
}
