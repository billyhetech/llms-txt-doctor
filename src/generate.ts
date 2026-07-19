import {
  extractDescription,
  extractLinks,
  extractSiteName,
  extractTitle,
} from './extract.js';
import { discoverFromSitemaps, fetchText, mapPool } from './fetch.js';
import { groupIntoSections, renderLlmsTxt } from './render.js';
import type { GenerateOptions, GenerateResult, PageEntry } from './types.js';

export function normalizeBaseUrl(input: string): URL {
  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(withProtocol);
  url.hash = '';
  url.search = '';
  return url;
}

function matchesPrefixes(pathname: string, prefixes: string[] | undefined): boolean {
  if (!prefixes || prefixes.length === 0) return false;
  return prefixes.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Pages that add noise rather than signal for LLMs: auth flows, account
 * areas, carts, and pagination tails. Skipped by default; `--all` keeps them.
 */
const NOISE_PATH_RE =
  /(?:^|\/)(?:auth|login|logout|register|signin|signup|sign-in|sign-up|account|admin|dashboard|cart|checkout|unsubscribe|404|500)(?:\/|$)|\/page\/\d+\/?$/i;

export function isNoisePath(pathname: string): boolean {
  return NOISE_PATH_RE.test(pathname);
}

export async function generateLlmsTxt(options: GenerateOptions): Promise<GenerateResult> {
  const log = options.log ?? (() => {});
  const maxPages = options.maxPages ?? 50;
  const concurrency = options.concurrency ?? 5;
  const base = normalizeBaseUrl(options.url);

  log(`fetching ${base.toString()}`);
  const homepageHtml = await fetchText(base.toString());
  if (homepageHtml === null) {
    throw new Error(`Could not fetch ${base.toString()} — is the site reachable?`);
  }

  const siteName = extractSiteName(homepageHtml);
  const title = options.title ?? siteName ?? extractTitle(homepageHtml) ?? base.hostname;
  const summary = options.description ?? extractDescription(homepageHtml);

  let candidates = await discoverFromSitemaps(base, log);
  const usedSitemap = candidates.length > 0;
  if (!usedSitemap) {
    log('no sitemap found, crawling homepage links');
    candidates = extractLinks(homepageHtml, base.toString());
  }

  const seen = new Set<string>();
  const pageUrls: string[] = [];
  for (const candidate of candidates) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    if (url.origin !== base.origin) continue;
    url.hash = '';
    url.search = '';
    if (url.pathname === '/') continue;
    if (!options.all && isNoisePath(url.pathname)) continue;
    if (matchesPrefixes(url.pathname, options.exclude)) continue;
    if (options.include && options.include.length > 0 && !matchesPrefixes(url.pathname, options.include)) {
      continue;
    }
    const normalized = url.toString();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    pageUrls.push(normalized);
    if (pageUrls.length >= maxPages) break;
  }

  log(`fetching ${pageUrls.length} pages (concurrency ${concurrency})`);
  let done = 0;
  const entries = (
    await mapPool(pageUrls, concurrency, async (url): Promise<PageEntry | null> => {
      const html = await fetchText(url);
      done += 1;
      if (done % 10 === 0) log(`  ${done}/${pageUrls.length}`);
      if (html === null) return null;
      const pageTitle = extractTitle(html, siteName ?? title);
      if (!pageTitle) return null;
      return { url, title: pageTitle, description: extractDescription(html) };
    })
  ).filter((entry): entry is PageEntry => entry !== null);

  const sections = groupIntoSections(entries);
  const content = renderLlmsTxt({ title, summary, sections });

  return {
    content,
    pageCount: entries.length,
    sectionCount: sections.length,
    usedSitemap,
  };
}
