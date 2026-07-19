import { describe, expect, it } from 'vitest';
import { groupIntoSections, renderLlmsTxt } from '../src/render.js';

describe('groupIntoSections', () => {
  it('groups by first path segment, root pages into Pages (last)', () => {
    const sections = groupIntoSections([
      { url: 'https://a.com/pricing', title: 'Pricing' },
      { url: 'https://a.com/docs/intro', title: 'Intro' },
      { url: 'https://a.com/docs/api', title: 'API' },
      { url: 'https://a.com/', title: 'Home' },
    ]);
    expect(sections.map((s) => s.name)).toEqual(['Docs', 'Pages']);
    expect(sections[0]?.entries.map((e) => e.title)).toEqual(['API', 'Intro']);
  });
  it('title-cases hyphenated segments', () => {
    const sections = groupIntoSections([
      { url: 'https://a.com/case-studies/x', title: 'X' },
    ]);
    expect(sections[0]?.name).toBe('Case Studies');
  });
});

describe('renderLlmsTxt', () => {
  it('renders the llmstxt.org format', () => {
    const output = renderLlmsTxt({
      title: 'Acme',
      summary: 'Does things.',
      sections: [
        {
          name: 'Docs',
          entries: [
            { url: 'https://a.com/docs/intro', title: 'Intro', description: 'Start here' },
            { url: 'https://a.com/docs/api', title: 'API [v2]' },
          ],
        },
      ],
    });
    expect(output).toBe(
      '# Acme\n\n> Does things.\n\n## Docs\n\n- [Intro](https://a.com/docs/intro): Start here\n- [API \\[v2\\]](https://a.com/docs/api)\n',
    );
  });
  it('omits summary when absent', () => {
    expect(renderLlmsTxt({ title: 'A', sections: [] })).toBe('# A\n');
  });
});
