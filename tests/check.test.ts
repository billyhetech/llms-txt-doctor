import { describe, expect, it } from 'vitest';
import {
  allLinks,
  isChinesePath,
  lintStructure,
  normalizeForCoverage,
  parseLlmsTxt,
  sampleEvenly,
} from '../src/check.js';

const GOOD = `# Acme

> Acme does things, explained for models.

## Docs

- [Intro](https://a.com/docs/intro): Start here
- [API](https://a.com/docs/api)

## Optional

- [Blog](https://a.com/blog)
`;

describe('parseLlmsTxt', () => {
  it('parses title, summary, sections and links', () => {
    const parsed = parseLlmsTxt(GOOD);
    expect(parsed.title).toBe('Acme');
    expect(parsed.summary).toBe('Acme does things, explained for models.');
    expect(parsed.sections.map((s) => s.name)).toEqual(['Docs', 'Optional']);
    expect(allLinks(parsed)).toHaveLength(3);
    expect(parsed.sections[0]?.links[0]).toEqual({
      title: 'Intro',
      url: 'https://a.com/docs/intro',
      description: 'Start here',
    });
  });
  it('collects links outside sections as loose links', () => {
    const parsed = parseLlmsTxt('# T\n\n- [A](https://a.com/a)\n');
    expect(parsed.looseLinks).toHaveLength(1);
    expect(parsed.sections).toHaveLength(0);
  });
  it('joins multi-line summaries', () => {
    const parsed = parseLlmsTxt('# T\n\n> line one\n> line two\n');
    expect(parsed.summary).toBe('line one line two');
  });
});

describe('lintStructure', () => {
  it('passes a well-formed file', () => {
    const parsed = parseLlmsTxt(GOOD);
    const levels = lintStructure(parsed, GOOD).map((i) => i.level);
    expect(levels).not.toContain('fail');
    expect(levels).not.toContain('warn');
  });
  it('fails on missing H1 and missing links', () => {
    const content = 'just some text\n';
    const ids = lintStructure(parseLlmsTxt(content), content)
      .filter((i) => i.level === 'fail')
      .map((i) => i.id);
    expect(ids).toContain('missing-h1');
    expect(ids).toContain('no-links');
  });
  it('warns on missing summary and ungrouped links', () => {
    const content = '# T\n\n- [A](https://a.com/a)\n';
    const ids = lintStructure(parseLlmsTxt(content), content)
      .filter((i) => i.level === 'warn')
      .map((i) => i.id);
    expect(ids).toContain('missing-summary');
    expect(ids).toContain('no-sections');
  });
});

describe('normalizeForCoverage', () => {
  it('strips hash, query and trailing slash; lowercases origin', () => {
    expect(normalizeForCoverage('HTTPS://A.com/Docs/?x=1#y')).toBe('https://a.com/Docs');
    expect(normalizeForCoverage('https://a.com/')).toBe('https://a.com');
  });
  it('resolves relative URLs against a base', () => {
    expect(normalizeForCoverage('/docs', new URL('https://a.com'))).toBe('https://a.com/docs');
  });
  it('returns null for garbage', () => {
    expect(normalizeForCoverage('not a url')).toBeNull();
  });
});

describe('isChinesePath', () => {
  it('matches common Chinese path conventions', () => {
    expect(isChinesePath('https://a.com/zh/docs')).toBe(true);
    expect(isChinesePath('https://a.com/zh-hans/')).toBe(true);
    expect(isChinesePath('https://a.com/blog/post.zh.html')).toBe(true);
  });
  it('does not match unrelated paths', () => {
    expect(isChinesePath('https://a.com/zhang/profile')).toBe(false);
    expect(isChinesePath('https://a.com/docs')).toBe(false);
  });
});

describe('sampleEvenly', () => {
  it('returns all items when under the cap', () => {
    expect(sampleEvenly([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });
  it('samples evenly and keeps order', () => {
    const sampled = sampleEvenly([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4);
    expect(sampled).toHaveLength(4);
    expect(sampled).toEqual([...sampled].sort((a, b) => a - b));
    expect(sampled[0]).toBe(1);
  });
});
