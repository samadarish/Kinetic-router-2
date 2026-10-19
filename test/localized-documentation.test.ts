import { describe, expect, it } from 'vitest';
import { docsRoutes, getDocsPage, models } from '../apps/site/data/content';
import { getLocalizedDocsPage } from '../apps/site/data/localized-documentation';
import { getDocsPresentation } from '../apps/site/data/docs-presentation';
import { searchDocumentation } from '../apps/site/data/docs-search';
import { SUPPORTED_LOCALES } from '@kineticrouter/platform-config/locale';
import { loadCatalog, translateText } from '@kineticrouter/i18n';

const code = (html: string) => [...html.matchAll(/<code\b[^>]*>([\s\S]*?)<\/code>/g)].map(match => match[1]);
const structuralAttributes = (html: string) => [...html.matchAll(/\b(?:href|id|src)=(?:"[^"]*"|'[^']*')/g)].map(match => match[0]);

describe('localized documentation', () => {
  it.each(SUPPORTED_LOCALES.map(locale => locale.code))('keeps model names exact in %s', async locale => {
    const catalog = await loadCatalog(locale, 'site');
    for (const model of models) {
      expect(translateText(model.name, catalog)).toBe(model.name);
      const displayName = model.name.replace(/^[^:]+:\s*/, '');
      expect(translateText(displayName, catalog)).toBe(displayName);
    }
  });

  it.each(SUPPORTED_LOCALES.map(locale => locale.code))('preserves code, links, anchors, and availability in %s across all routes', async locale => {
    for (const route of docsRoutes) {
      const english = getDocsPage(route);
      const localized = await getLocalizedDocsPage(route, locale);
      expect(code(localized.content!.html), `${locale}:${route}`).toEqual(code(english.content!.html));
      expect(structuralAttributes(localized.content!.html), `${locale}:${route}`).toEqual(structuralAttributes(english.content!.html));
      expect(localized.status.status).toBe(english.status.status);
      expect(localized.status.sources).toEqual(english.status.sources);
    }
  });

  it('isolates page and presentation caches by locale, translates headings, and supports localized search', async () => {
    const route = '/docs/develop/authentication';
    const english = getDocsPage(route);
    const spanish = await getLocalizedDocsPage(route, 'es');
    const french = await getLocalizedDocsPage(route, 'fr');
    expect(spanish).toBe(await getLocalizedDocsPage(route, 'es'));
    expect(spanish).not.toBe(english);
    expect(spanish).not.toBe(french);
    expect(spanish.meta!.title).not.toBe(english.meta!.title);
    expect(french.meta!.title).not.toBe(spanish.meta!.title);
    const presentation = getDocsPresentation(spanish)!;
    expect(presentation.toc.map(item => item.id)).toEqual(getDocsPresentation(english)!.toc.map(item => item.id));
    expect(getDocsPage(route)).toBe(english);
    expect(searchDocumentation([{ route, title: spanish.meta!.title, headings: spanish.meta!.headings, text: spanish.content!.text }], spanish.meta!.title)).toHaveLength(1);
  });
});
