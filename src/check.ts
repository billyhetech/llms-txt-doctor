import { discoverFromSitemaps, fetchRaw, probeStatus } from './fetch.js';
import { normalizeBaseUrl } from './generate.js';
import type {
  CheckIssue,
  CheckOptions,
  CheckResult,
  ParsedLink,
  ParsedLlmsTxt,
} from './types.js';

const LINK_ITEM_RE = /^[-*]\s*\[([^\]]*)\]\(<?([^)\s>]+)>?\)\s*:?\s*(.*)$/;
// Bare-URL list items ("- https://…"), a real-world variant used by e.g.
// Cursor's llms.txt. Title falls back to the URL's last path segment.
const BARE_URL_ITEM_RE = /^[-*]\s*<?(https?:\/\/[^\s>]+)>?\s*(?::\s*(.*))?$/;

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : u.hostname;
  } catch {
    return url;
  }
}

/** Parse llms.txt into title / summary / sections / links. Pure. */
export function parseLlmsTxt(content: string): ParsedLlmsTxt {
  const result: ParsedLlmsTxt = { sections: [], looseLinks: [] };
  let currentSection: { name: string; links: ParsedLink[] } | null = null;
  let inSummary = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      inSummary = false;
      continue;
    }
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1 && !result.title && !currentSection) {
      result.title = (h1[1] as string).trim();
      continue;
    }
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      currentSection = { name: (h2[1] as string).trim(), links: [] };
      result.sections.push(currentSection);
      inSummary = false;
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote && result.sections.length === 0) {
      const text = (quote[1] as string).trim();
      result.summary =
        result.summary !== undefined && inSummary ? `${result.summary} ${text}`.trim() : text;
      inSummary = true;
      continue;
    }
    inSummary = false;
    const item = line.match(LINK_ITEM_RE);
    if (item) {
      const link: ParsedLink = {
        title: (item[1] as string).trim(),
        url: (item[2] as string).trim(),
      };
      const description = (item[3] as string).trim();
      if (description) link.description = description;
      (currentSection ? currentSection.links : result.looseLinks).push(link);
      continue;
    }
    const bare = line.match(BARE_URL_ITEM_RE);
    if (bare) {
      const url = (bare[1] as string).trim();
      const link: ParsedLink = { title: titleFromUrl(url), url };
      const description = (bare[2] ?? '').trim();
      if (description) link.description = description;
      (currentSection ? currentSection.links : result.looseLinks).push(link);
    }
  }
  return result;
}

export function allLinks(parsed: ParsedLlmsTxt): ParsedLink[] {
  return [...parsed.sections.flatMap((s) => s.links), ...parsed.looseLinks];
}

/** Origin+path with no hash/query/trailing-slash, for set comparison. */
export function normalizeForCoverage(url: string, base?: URL): string | null {
  try {
    const u = new URL(url, base);
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.origin.toLowerCase()}${path}`;
  } catch {
    return null;
  }
}

const CHINESE_PATH_RE = /(?:^|\/)zh(?:-hans|-hant|-cn|-tw|-hk)?(?:\/|$)|\.zh(?:\.|$)/i;

export function isChinesePath(url: string): boolean {
  try {
    return CHINESE_PATH_RE.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** Structural spec lint on parsed content. Pure. */
export function lintStructure(parsed: ParsedLlmsTxt, content: string): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const linkCount = allLinks(parsed).length;

  if (!parsed.title) {
    issues.push({
      id: 'missing-h1',
      level: 'fail',
      message: 'No `# Title` heading — the spec requires an H1 as the first element',
    });
  } else {
    const firstLine = content.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
    if (!/^#\s/.test(firstLine.trim())) {
      issues.push({
        id: 'h1-not-first',
        level: 'warn',
        message: 'H1 title is not the first line of the file',
      });
    } else {
      issues.push({ id: 'h1', level: 'ok', message: `H1 title: "${parsed.title}"` });
    }
  }

  if (parsed.summary) {
    issues.push({ id: 'summary', level: 'ok', message: 'Has `> summary` blockquote' });
  } else {
    issues.push({
      id: 'missing-summary',
      level: 'warn',
      message: 'Missing `> summary` blockquote after the title',
    });
  }

  if (linkCount === 0) {
    issues.push({
      id: 'no-links',
      level: 'fail',
      message: 'No markdown links found — an llms.txt without links tells models nothing',
    });
  } else {
    issues.push({
      id: 'links',
      level: 'ok',
      message: `${parsed.sections.length} section(s), ${linkCount} link(s)`,
    });
    if (parsed.sections.length === 0) {
      issues.push({
        id: 'no-sections',
        level: 'warn',
        message: 'Links are not grouped under `##` sections',
      });
    }
  }

  if (content.length > 100_000) {
    issues.push({
      id: 'very-large',
      level: 'warn',
      message: `File is ${Math.round(content.length / 1024)} KB — llms.txt is an index, move bulk content to llms-full.txt`,
    });
  }

  return issues;
}

/** Evenly sample up to `max` items, keeping order. */
export function sampleEvenly<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  const step = items.length / max;
  const sampled: T[] = [];
  for (let i = 0; i < max; i++) sampled.push(items[Math.floor(i * step)] as T);
  return sampled;
}

export async function checkSite(options: CheckOptions): Promise<CheckResult> {
  const log = options.log ?? (() => {});
  const maxLinks = options.maxLinks ?? 20;
  const base = normalizeBaseUrl(options.url);
  const llmsTxtUrl = new URL('/llms.txt', base).toString();
  const issues: CheckIssue[] = [];

  log(`fetching ${llmsTxtUrl}`);
  const response = await fetchRaw(llmsTxtUrl);
  if (response === null || response.status >= 400) {
    issues.push({
      id: 'not-found',
      level: 'fail',
      message:
        response === null
          ? `Could not reach ${llmsTxtUrl} (network error)`
          : `/llms.txt returned HTTP ${response.status}`,
    });
    return { siteUrl: base.toString(), llmsTxtUrl, found: false, issues, stats: null };
  }

  const looksLikeHtml = /^\s*<!doctype html|^\s*<html/i.test(response.text);
  if (looksLikeHtml) {
    issues.push({
      id: 'html-body',
      level: 'fail',
      message:
        '/llms.txt returned an HTML page (probably an SPA fallback route) — models get markup, not markdown',
    });
    return { siteUrl: base.toString(), llmsTxtUrl, found: false, issues, stats: null };
  }
  issues.push({
    id: 'found',
    level: 'ok',
    message: `/llms.txt found (${response.contentType.split(';')[0] || 'no content-type'}, ${(response.text.length / 1024).toFixed(1)} KB)`,
  });
  if (/text\/html/i.test(response.contentType)) {
    issues.push({
      id: 'html-content-type',
      level: 'warn',
      message: 'Served with `text/html` content-type — should be `text/plain` or `text/markdown`',
    });
  }

  const parsed = parseLlmsTxt(response.text);
  issues.push(...lintStructure(parsed, response.text));
  const links = allLinks(parsed);

  // Advanced practice (Cursor, Vercel, Mintlify docs): links point at .md
  // mirrors of each page, so models read clean markdown instead of HTML.
  const mdLinks = links.filter((l) => /\.md$/i.test(l.url.split('?')[0] ?? '')).length;
  if (links.length > 0 && mdLinks / links.length >= 0.5) {
    issues.push({
      id: 'md-mirrors',
      level: 'info',
      message: `${mdLinks} of ${links.length} links point to .md markdown mirrors — models get clean markdown`,
    });
  }

  // Link liveness (sampled)
  let checkedLinks = 0;
  let deadLinks = 0;
  if (links.length > 0) {
    const sample = sampleEvenly(links, maxLinks);
    log(`probing ${sample.length} of ${links.length} links`);
    const dead: string[] = [];
    let blocked = 0;
    for (const link of sample) {
      let absolute: string;
      try {
        absolute = new URL(link.url, base).toString();
      } catch {
        dead.push(link.url);
        continue;
      }
      const status = await probeStatus(absolute);
      checkedLinks += 1;
      if (status === null || status === 404 || status === 410) dead.push(link.url);
      else if ([401, 403, 429].includes(status)) blocked += 1;
    }
    deadLinks = dead.length;
    if (deadLinks > 0) {
      const shown = dead.slice(0, 5).join(', ');
      issues.push({
        id: 'dead-links',
        level: 'fail',
        message: `${deadLinks} dead link(s) out of ${checkedLinks} checked: ${shown}${dead.length > 5 ? ', …' : ''}`,
      });
    } else {
      issues.push({
        id: 'links-alive',
        level: 'ok',
        message: `Links alive: ${checkedLinks}/${checkedLinks} checked${blocked > 0 ? ` (${blocked} blocked by bot protection, not counted)` : ''}`,
      });
    }
  }

  // Coverage vs sitemap
  log('fetching sitemap for coverage');
  const sitemapUrls = await discoverFromSitemaps(base, log);
  let sitemapUrlCount: number | null = null;
  let coveredSitemapUrls: number | null = null;
  let coveragePct: number | null = null;
  let chineseSitemapUrls = 0;
  if (sitemapUrls.length > 0) {
    const sitemapSet = new Set(
      sitemapUrls
        .map((u) => normalizeForCoverage(u))
        .filter((u): u is string => u !== null),
    );
    const listedSet = new Set(
      links
        .map((l) => normalizeForCoverage(l.url, base))
        .filter((u): u is string => u !== null),
    );
    sitemapUrlCount = sitemapSet.size;
    coveredSitemapUrls = [...sitemapSet].filter((u) => listedSet.has(u)).length;
    coveragePct = sitemapUrlCount > 0 ? Math.round((coveredSitemapUrls / sitemapUrlCount) * 100) : null;
    // Many docs-style llms.txt files link to another origin (docs.example.com);
    // coverage against this domain's sitemap then understates by design.
    const offOrigin = links.filter((l) => {
      try {
        return new URL(l.url, base).origin !== base.origin;
      } catch {
        return false;
      }
    }).length;
    const offOriginNote =
      links.length > 0 && offOrigin / links.length >= 0.5
        ? ' — most links point to another origin, so this understates by design'
        : '';
    issues.push({
      id: 'coverage',
      level: 'info',
      message: `Covers ${coveredSitemapUrls} of ${sitemapUrlCount} sitemap URLs (${coveragePct}%)${offOriginNote}`,
    });
    chineseSitemapUrls = sitemapUrls.filter((u) => isChinesePath(u)).length;
  } else {
    issues.push({
      id: 'no-sitemap',
      level: 'info',
      message: 'No sitemap found — skipping coverage check',
    });
  }

  // Bilingual gap
  const chineseListedLinks = links.filter((l) => {
    try {
      return isChinesePath(new URL(l.url, base).toString());
    } catch {
      return false;
    }
  }).length;
  if (chineseSitemapUrls > 0 && chineseListedLinks === 0) {
    issues.push({
      id: 'bilingual-gap',
      level: 'warn',
      message: `Site has ${chineseSitemapUrls} Chinese page(s) in its sitemap but llms.txt lists none of them`,
    });
  }

  // llms-full.txt
  const fullStatus = await probeStatus(new URL('/llms-full.txt', base).toString());
  const hasLlmsFullTxt = fullStatus !== null && fullStatus < 400;
  issues.push({
    id: 'llms-full',
    level: 'info',
    message: hasLlmsFullTxt ? 'llms-full.txt: present' : 'llms-full.txt: not found (optional)',
  });

  return {
    siteUrl: base.toString(),
    llmsTxtUrl,
    found: true,
    issues,
    stats: {
      linkCount: links.length,
      sectionCount: parsed.sections.length,
      checkedLinks,
      deadLinks,
      sitemapUrlCount,
      coveredSitemapUrls,
      coveragePct,
      chineseSitemapUrls,
      chineseListedLinks,
      hasLlmsFullTxt,
      bytes: response.text.length,
    },
  };
}
