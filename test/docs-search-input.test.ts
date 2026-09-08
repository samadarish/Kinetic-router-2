import { describe, expect, it } from 'vitest';
import { decodeDocsSearchIndex, searchResultFocusIndex } from '../apps/site/data/docs-search';
import { docsRoutes, getDocsPage } from '../apps/site/data/content';

describe('documentation search input', () => {
  const entry = { route: '/docs/develop', title: 'Quick start', headings: ['API keys'], text: 'Create an API key.' };

  it('accepts current documentation routes and copies only the supported fields', () => {
    const entries = docsRoutes.flatMap((route) => {
      const { meta, content, status } = getDocsPage(route);
      return meta && content && status.status !== 'planned'
        ? [{ route, title: meta.title, headings: meta.headings, text: content.text }]
        : [];
    });
    expect(decodeDocsSearchIndex(entries)).toEqual(entries);
    expect(decodeDocsSearchIndex([{ ...entry, extra: 'ignored' }])).toEqual([entry]);
  });

  it.each([
    null, {}, { ok: false }, [null], [{ ...entry, title: null }],
    [{ ...entry, headings: 'API keys' }], [{ ...entry, headings: [null] }], [{ ...entry, text: undefined }],
  ])('rejects malformed payload %# for the retry UI to handle', (payload) => {
    expect(() => decodeDocsSearchIndex(payload)).toThrow(/Invalid documentation search/);
  });

  it.each(['javascript:alert(1)', '//other.example/docs', '/account/sign-in', '/docs/../account', '/docs?next=bad'])('rejects non-documentation result URL %s', (route) => {
    expect(() => decodeDocsSearchIndex([{ ...entry, route }])).toThrow(/Invalid documentation search/);
  });

  it('moves from the input to the first or last result and wraps correctly', () => {
    expect(searchResultFocusIndex('ArrowDown', -1, 3)).toBe(0);
    expect(searchResultFocusIndex('ArrowUp', -1, 3)).toBe(2);
    expect(searchResultFocusIndex('ArrowDown', 2, 3)).toBe(0);
    expect(searchResultFocusIndex('ArrowUp', 0, 3)).toBe(2);
    expect(searchResultFocusIndex('ArrowUp', -1, 0)).toBe(-1);
  });
});
