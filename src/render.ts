import type { LlmsTxtData, PageEntry, Section } from './types.js';

function titleCaseSegment(segment: string): string {
  return segment
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Group pages by first path segment. Root-level pages (`/pricing`) land in a
 * generic "Pages" section, which sorts last; other sections sort by size.
 */
export function groupIntoSections(entries: PageEntry[]): Section[] {
  const buckets = new Map<string, PageEntry[]>();
  for (const entry of entries) {
    let pathname: string;
    try {
      pathname = new URL(entry.url).pathname;
    } catch {
      continue;
    }
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length === 0) continue; // homepage feeds the header, not a section
    const key = segments.length === 1 ? 'Pages' : titleCaseSegment(segments[0] as string);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(entry);
    else buckets.set(key, [entry]);
  }
  const sections: Section[] = [...buckets.entries()].map(([name, sectionEntries]) => ({
    name,
    entries: [...sectionEntries].sort((a, b) => a.url.localeCompare(b.url)),
  }));
  sections.sort((a, b) => {
    const aLast = a.name === 'Pages' ? 1 : 0;
    const bLast = b.name === 'Pages' ? 1 : 0;
    if (aLast !== bLast) return aLast - bLast;
    if (a.entries.length !== b.entries.length) return b.entries.length - a.entries.length;
    return a.name.localeCompare(b.name);
  });
  return sections;
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
