import { describe, expect, it } from 'vitest';
import { getDirectNavigationUrl } from './searchNavigation';

describe('getDirectNavigationUrl', () => {
  it.each([
    ['https://example.com/docs', 'https://example.com/docs'],
    ['http://example.com', 'http://example.com/'],
    ['example.com/docs', 'https://example.com/docs'],
    ['www.example.com', 'https://www.example.com/'],
    ['localhost:3000', 'https://localhost:3000/'],
  ])('recognizes %s as a direct link', (input, expected) => {
    expect(getDirectNavigationUrl(input)).toBe(expected);
  });

  it.each(['best bookmark apps', 'example search', '', 'not a url']) (
    'keeps %j as a search query',
    (input) => {
      expect(getDirectNavigationUrl(input)).toBeNull();
    },
  );
});
