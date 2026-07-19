import { describe, expect, it } from 'vitest';
import { isNoisePath, normalizeBaseUrl } from '../src/generate.js';

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
