export interface PageEntry {
  url: string;
  title: string;
  description?: string;
}

export interface Section {
  name: string;
  entries: PageEntry[];
}

export interface LlmsTxtData {
  title: string;
  summary?: string;
  sections: Section[];
}

export interface GenerateOptions {
  /** Site to generate for, e.g. "https://example.com" (protocol optional). */
  url: string;
  /** Max pages to fetch and include. Default 50. */
  maxPages?: number;
  /** Parallel page fetches. Default 5. */
  concurrency?: number;
  /** Override the site title (`# ...` line). */
  title?: string;
  /** Override the summary (`> ...` line). */
  description?: string;
  /** Only include paths starting with one of these prefixes, e.g. ["/docs"]. */
  include?: string[];
  /** Skip paths starting with one of these prefixes, e.g. ["/legal"]. */
  exclude?: string[];
  /** Progress logger. Default: silent. */
  log?: (message: string) => void;
}

export interface ParsedLink {
  title: string;
  url: string;
  description?: string;
}

export interface ParsedLlmsTxt {
  title?: string;
  summary?: string;
  sections: { name: string; links: ParsedLink[] }[];
  /** Links found outside any `##` section. */
  looseLinks: ParsedLink[];
}

export type IssueLevel = 'ok' | 'info' | 'warn' | 'fail';

export interface CheckIssue {
  id: string;
  level: IssueLevel;
  message: string;
}

export interface CheckOptions {
  /** Site to check, e.g. "https://example.com" (protocol optional). */
  url: string;
  /** Max links to probe for liveness. Default 20. */
  maxLinks?: number;
  /** Progress logger. Default: silent. */
  log?: (message: string) => void;
}

export interface CheckStats {
  linkCount: number;
  sectionCount: number;
  checkedLinks: number;
  deadLinks: number;
  sitemapUrlCount: number | null;
  coveredSitemapUrls: number | null;
  coveragePct: number | null;
  chineseSitemapUrls: number;
  chineseListedLinks: number;
  hasLlmsFullTxt: boolean;
  bytes: number;
}

export interface CheckResult {
  siteUrl: string;
  llmsTxtUrl: string;
  found: boolean;
  issues: CheckIssue[];
  stats: CheckStats | null;
}

export interface GenerateResult {
  /** The rendered llms.txt content. */
  content: string;
  /** Pages that made it into the file. */
  pageCount: number;
  sectionCount: number;
  /** True if URLs came from a sitemap, false if crawled from homepage links. */
  usedSitemap: boolean;
}
