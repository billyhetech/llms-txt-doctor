import type { LlmsTxtData, PageEntry, Section } from './types.js';

function titleCaseSegment(segment: string): string {
  return segment
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Locale path prefixes → native section names. Fallback: uppercased code. */
const LOCALE_NAMES: Record<string, string> = {
  zh: '中文 (Chinese)',
  ja: '日本語 (Japanese)',
  ko: '한국어 (Korean)',
  fr: 'Français (French)',
  de: 'Deutsch (German)',
  es: 'Español (Spanish)',
  pt: 'Português (Portuguese)',
  it: 'Italiano (Italian)',
  ru: 'Русский (Russian)',
  en: 'English',
};

const LOCALE_SEGMENT_RE = /^([a-z]{2})(?:-[a-z]{2,4})?$/i;

/** "zh" / "zh-CN" / "ja" first path segments count as locale prefixes. */
export function localeFromSegment(segment: string): string | null {
  const match = segment.match(LOCALE_SEGMENT_RE);
  if (!match) return null;
  const code = (match[1] as string).toLowerCase();
  // Only treat it as a locale when it's a code we know — otherwise "vs"
  // or "ai" style two-letter product paths would be swallowed.
  return code in LOCALE_NAMES ? code : null;
}

/** Legal/boilerplate pages belong in the spec's "Optional" section. */
const OPTIONAL_PATH_RE =
  /^\/?(?:privacy|terms|cookie|cookies|refund|legal|imprint|impressum|disclaimer)(?:\/|$)/i;

type SectionKind = 'content' | 'pages' | 'locale' | 'optional';

/**
 * Group pages by first path segment. Localized pages (`/zh/...`) collapse
 * into one native-named section per locale; legal boilerplate goes to
 * "Optional". Order: content sections (by size), Pages, locales, Optional.
 */
export function groupIntoSections(entries: PageEntry[]): Section[] {
  const buckets = new Map<string, { kind: SectionKind; entries: PageEntry[] }>();
  const put = (key: string, kind: SectionKind, entry: PageEntry) => {
    const bucket = buckets.get(key);
    if (bucket) bucket.entries.push(entry);
    else buckets.set(key, { kind, entries: [entry] });
  };
  for (const entry of entries) {
    let pathname: string;
    try {
      pathname = new URL(entry.url).pathname;
    } catch {
      continue;
    }
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length === 0) continue; // homepage feeds the header, not a section
    const locale = localeFromSegment(segments[0] as string);
    if (locale) {
      put(LOCALE_NAMES[locale] ?? locale.toUpperCase(), 'locale', entry);
      continue;
    }
    if (OPTIONAL_PATH_RE.test(pathname)) {
      put('Optional', 'optional', entry);
      continue;
    }
    if (segments.length === 1) put('Pages', 'pages', entry);
    else put(titleCaseSegment(segments[0] as string), 'content', entry);
  }
  const KIND_ORDER: Record<SectionKind, number> = { content: 0, pages: 1, locale: 2, optional: 3 };
  const sections = [...buckets.entries()].map(([name, bucket]) => ({
    name,
    kind: bucket.kind,
    entries: [...bucket.entries].sort((a, b) => a.url.localeCompare(b.url)),
  }));
  sections.sort((a, b) => {
    if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (a.kind === 'content' && a.entries.length !== b.entries.length) {
      return b.entries.length - a.entries.length;
    }
    return a.name.localeCompare(b.name);
  });
  return sections.map(({ name, entries: sectionEntries }) => ({ name, entries: sectionEntries }));
}

function escapeLinkTitle(title: string): string {
  return title.replace(/([[\]])/g, '\\$1');
}

/** Render to the llmstxt.org format: `# title`, `> summary`, `## section`, link lists. */
export function renderLlmsTxt(data: LlmsTxtData): string {
  const parts: string[] = [`# ${data.title}`];
  if (data.summary) parts.push(`> ${data.summary}`);
  for (const section of data.sections) {
    const lines = section.entries.map((entry) => {
      const description = entry.description ? `: ${entry.description}` : '';
      return `- [${escapeLinkTitle(entry.title)}](${entry.url})${description}`;
    });
    parts.push(`## ${section.name}\n\n${lines.join('\n')}`);
  }
  return `${parts.join('\n\n')}\n`;
}
