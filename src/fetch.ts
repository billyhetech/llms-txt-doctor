import { parseSitemap } from './extract.js';

const USER_AGENT = 'llms-txt-doctor/0.1 (+https://github.com/billyhetech/llms-txt-doctor)';

export interface RawResponse {
  status: number;
  contentType: string;
  text: string;
}

/** Fetch returning status + content-type + body; null only on network error/timeout. */
export async function fetchRaw(url: string, timeoutMs = 15_000): Promise<RawResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'text/plain,text/markdown,*/*;q=0.8' },
    });
    return {
      status: res.status,
      contentType: res.headers.get('content-type') ?? '',
      text: await res.text(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** HTTP status for a URL: HEAD with GET fallback; null on network failure. */
export async function probeStatus(url: string, timeoutMs = 10_000): Promise<number | null> {
  for (const method of ['HEAD', 'GET'] as const) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'user-agent': USER_AGENT },
      });
      // Some servers reject HEAD; retry those with GET before trusting the status.
      if (method === 'HEAD' && [403, 405, 501].includes(res.status)) continue;
      return res.status;
    } catch {
      // fall through to GET, or give up
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export async function fetchText(url: string, timeoutMs = 15_000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType && !/text\/|html|xml/i.test(contentType)) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Run `fn` over `items` with at most `limit` in flight; preserves order. */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Collect page URLs from the site's sitemaps: robots.txt `Sitemap:` lines first,
 * then /sitemap.xml and /sitemap_index.xml. Follows sitemap indexes one level
 * deep, caps total sitemap fetches to keep things polite.
 */
export async function discoverFromSitemaps(
  base: URL,
  log: (message: string) => void,
  maxSitemapFetches = 10,
): Promise<string[]> {
  const candidates: string[] = [];
  const robots = await fetchText(new URL('/robots.txt', base).toString(), 8_000);
  if (robots) {
    for (const match of robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)) {
      if (match[1]) candidates.push(match[1]);
    }
  }
  candidates.push(
    new URL('/sitemap.xml', base).toString(),
    new URL('/sitemap_index.xml', base).toString(),
  );

  const queue = [...new Set(candidates)];
  const visited = new Set<string>();
  const urls = new Set<string>();
  let fetches = 0;

  while (queue.length > 0 && fetches < maxSitemapFetches) {
    const sitemapUrl = queue.shift() as string;
    if (visited.has(sitemapUrl)) continue;
    visited.add(sitemapUrl);
    fetches += 1;
    const xml = await fetchText(sitemapUrl);
    if (!xml) continue;
    const { urls: pageUrls, sitemaps } = parseSitemap(xml);
    if (pageUrls.length > 0) log(`sitemap: ${sitemapUrl} (${pageUrls.length} URLs)`);
    for (const url of pageUrls) urls.add(url);
    queue.push(...sitemaps);
  }

  return [...urls];
}
