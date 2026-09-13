import { describe, expect, it } from 'vitest';
import { docsRoutes, getDocsPage } from '../apps/site/data/content';
import { getDocsPresentation } from '../apps/site/data/docs-presentation';

describe('static documentation caches', () => {
  it('reuses resolved content and presentation across all known routes without changing copy text', () => {
    for (const route of docsRoutes) {
      const page = getDocsPage(route);
      const before = JSON.stringify(page);
      const presentation = getDocsPresentation(page);
      expect(getDocsPage(route), route).toBe(page);
      expect(getDocsPresentation(page), route).toBe(presentation);
      expect(presentation?.html, route).toBeTruthy();
      expect(JSON.stringify(page), route).toBe(before);
      expect(page.content?.text, route).toBeTruthy();
    }
  });
  it('does not retain unknown paths or invent content for them', () => {
    const first = getDocsPage('/docs/unknown-performance-test');
    expect(first.meta).toBeUndefined();
    expect(first.content).toBeUndefined();
    expect(getDocsPresentation(first)).toBeUndefined();
    const second = getDocsPage('/docs/unknown-performance-test');
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });
});
