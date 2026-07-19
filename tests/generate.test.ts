import { describe, expect, it } from 'vitest';
import { isNoisePath, normalizeBaseUrl, stripBoilerplateDescriptions } from '../src/generate.js';

describe('isNoisePath', () => {
  it('flags auth flows and pagination tails', () => {
    expect(isNoisePath('/auth/login')).toBe(true);
    expect(isNoisePath('/zh/auth/register')).toBe(true);
    expect(isNoisePath('/blog/page/2')).toBe(true);
    expect(isNoisePath('/signup')).toBe(true);
  });
  it('keeps normal content paths', () => {
    expect(isNoisePath('/pricing')).toBe(false);
    expect(isNoisePath('/blog/my-post')).toBe(false);
    expect(isNoisePath('/loginless-checkout-guide')).toBe(false);
  });
});

describe('normalizeBaseUrl', () => {
  it('adds https and strips hash/query', () => {
    expect(normalizeBaseUrl('example.com/#x?y=1').toString()).toBe('https://example.com/');
  });
});

describe('stripBoilerplateDescriptions', () => {
  const boiler = 'Same default meta everywhere';
  it('drops a description repeated across >=30% of pages and >=3 times', () => {
    const entries = [
      { url: 'https://a.com/1', title: 'One', description: boiler },
      { url: 'https://a.com/2', title: 'Two', description: boiler },
      { url: 'https://a.com/3', title: 'Three', description: boiler },
      { url: 'https://a.com/4', title: 'Four', description: 'Unique text' },
    ];
    const result = stripBoilerplateDescriptions(entries, undefined);
    expect(result.filter((e) => e.description)).toHaveLength(1);
    expect(result[3]?.description).toBe('Unique text');
  });
  it('drops descriptions identical to the site summary', () => {
    const entries = [{ url: 'https://a.com/1', title: 'One', description: 'The summary' }];
    expect(stripBoilerplateDescriptions(entries, 'The summary')[0]?.description).toBeUndefined();
  });
  it('keeps distinct descriptions on small sets', () => {
    const entries = [
      { url: 'https://a.com/1', title: 'One', description: 'A' },
      { url: 'https://a.com/2', title: 'Two', description: 'B' },
    ];
    expect(stripBoilerplateDescriptions(entries, undefined)).toEqual(entries);
  });
});
