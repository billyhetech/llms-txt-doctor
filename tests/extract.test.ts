import { describe, expect, it } from 'vitest';
import {
  decodeEntities,
  extractDescription,
  extractLinks,
  extractTitle,
  metaContent,
  parseSitemap,
} from '../src/extract.js';

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities', () => {
    expect(decodeEntities('Q&amp;A &lt;3 &#169; &#x2764;')).toBe('Q&A <3 © ❤');
  });
  it('leaves unknown entities alone', () => {
    expect(decodeEntities('&whatever;')).toBe('&whatever;');
  });
});

describe('metaContent', () => {
  it('is attribute-order agnostic', () => {
    const html = '<meta content="Hello" name="description">';
    expect(metaContent(html, 'description')).toBe('Hello');
  });
  it('reads property-style og tags', () => {
    const html = "<meta property='og:title' content='My Page'>";
    expect(metaContent(html, 'og:title')).toBe('My Page');
  });
});

describe('extractTitle', () => {
  it('prefers og:title over <title>', () => {
    const html = '<meta property="og:title" content="Clean"><title>Clean | Site</title>';
    expect(extractTitle(html)).toBe('Clean');
  });
  it('falls back to <title> and strips the site-name suffix', () => {
    const html = '<title>Pricing | Acme</title>';
    expect(extractTitle(html, 'Acme')).toBe('Pricing');
  });
  it('strips suffixes where the site name is followed by a tagline', () => {
    const html = '<title>About | Acme — Track Everything Everywhere</title>';
    expect(extractTitle(html, 'Acme')).toBe('About');
  });
  it('keeps titles whose separators never mention the site name', () => {
    const html = '<title>Foo | Bar</title>';
    expect(extractTitle(html, 'Acme')).toBe('Foo | Bar');
  });
  it('decodes entities and collapses whitespace', () => {
    const html = '<title>  A &amp;\n B </title>';
    expect(extractTitle(html)).toBe('A & B');
  });
});

describe('extractDescription', () => {
  it('truncates long descriptions at a word boundary with ellipsis', () => {
    const long = 'word '.repeat(100).trim();
    const html = `<meta name="description" content="${long}">`;
    const result = extractDescription(html) as string;
    expect(result.length).toBeLessThanOrEqual(201);
    expect(result.endsWith('…')).toBe(true);
  });
});

describe('extractLinks', () => {
  const base = 'https://example.com/docs/';
  it('resolves relative links, dedupes, strips hash and query', () => {
    const html =
      '<a href="/a">1</a> <a href="/a#x">2</a> <a href="/a?y=1">3</a> <a href="intro">4</a>';
    expect(extractLinks(html, base)).toEqual([
      'https://example.com/a',
      'https://example.com/docs/intro',
    ]);
  });
  it('drops external, non-http and asset links', () => {
    const html =
      '<a href="https://other.com/x">e</a> <a href="mailto:a@b.c">m</a> <a href="/logo.png">img</a> <a href="#top">h</a>';
    expect(extractLinks(html, base)).toEqual([]);
  });
});

describe('parseSitemap', () => {
  it('parses urlset locs', () => {
    const xml = '<urlset><url><loc>https://a.com/1</loc></url><url><loc> https://a.com/2 </loc></url></urlset>';
    expect(parseSitemap(xml)).toEqual({ urls: ['https://a.com/1', 'https://a.com/2'], sitemaps: [] });
  });
  it('detects sitemap indexes', () => {
    const xml = '<sitemapindex><sitemap><loc>https://a.com/s1.xml</loc></sitemap></sitemapindex>';
    expect(parseSitemap(xml)).toEqual({ urls: [], sitemaps: ['https://a.com/s1.xml'] });
  });
});
