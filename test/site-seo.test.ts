import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { docsRoutes, getDocsPage, manifest, models } from '../apps/site/data/content';
import { authoredGuidesUpdatedAt } from '../apps/site/data/authored-guides';
import { indexableRoutes, pageMetadata, routeSeo, structuredData } from '../apps/site/data/seo';
import { canonicalAliases, canonicalUrl, isIndexableRoute, isProductionHostname, isUtilityRoute, serializeJsonLd } from '../apps/site/data/seo-policy.mjs';
import { catalogModel, displayContextWindow, usdPrice } from '../apps/site/data/model-utils';

describe('site SEO', () => {
  it('gives every public page its intended canonical and accurate metadata', () => {
    for (const route of [...manifest.mainRoutes, ...docsRoutes].filter((route) => !isUtilityRoute(route))) {
      const metadata = pageMetadata(route);
      expect(metadata.alternates?.canonical, route).toBe(canonicalUrl(route));
      expect(metadata.description, route).toBeTruthy();
      const title = (metadata.title as { absolute: string }).absolute;
      expect(title.match(/kineticRouter/gi), route).toHaveLength(1);
      expect(metadata.openGraph?.url, route).toBe(canonicalUrl(route));
      expect(metadata.description, route).not.toMatch(/live pric|currently available|guaranteed|lowest price/i);
    }
    expect(canonicalUrl('/models/openai?utm_source=test#details')).toBe('https://kineticrouter.com/models/openai');
    expect(canonicalUrl('/models/')).toBe('https://kineticrouter.com/models');
  });

  it('consolidates real duplicate views and keeps planned content out of both sitemaps', () => {
    const routes = indexableRoutes();
    expect(routes).toHaveLength(72);
    expect(new Set(routes).size).toBe(routes.length);
    for (const [alias, canonical] of Object.entries(canonicalAliases)) {
      expect(routes).not.toContain(alias);
      expect(pageMetadata(alias).alternates?.canonical).toBe(canonicalUrl(canonical));
    }
    const docs = routes.filter((route) => route.startsWith('/docs'));
    expect(docs).toHaveLength(41);
    const sitemap = readFileSync('apps/site/public/docs-sitemap.xml', 'utf8');
    expect([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])).toEqual(docs.map(canonicalUrl));
    for (const route of docsRoutes.filter((route) => getDocsPage(route).status.status === 'planned')) {
      expect(isIndexableRoute(route, 'planned')).toBe(false);
      expect(pageMetadata(route).robots).toMatchObject({ index: false });
      expect(structuredData(route)).toBeUndefined();
    }
  });

  it('uses only maintained content-update dates and factual structured data', () => {
    for (const route of indexableRoutes()) {
      const seo = routeSeo(route)!;
      const graph = structuredData(route)!['@graph'];
      const page = graph.find((entry) => entry['@id'] === `${canonicalUrl(route)}#webpage`)!;
      expect(page.url).toBe(canonicalUrl(route));
      expect(page.dateModified).toBe(seo.modified);
      expect(JSON.stringify(graph)).not.toMatch(/"(?:offers|aggregateRating|review|address|sameAs|SearchAction)"/);
      if (seo.modified) expect(seo.modified).toBe(authoredGuidesUpdatedAt);
    }
    expect(routeSeo('/docs/api/openai/chat')?.modified).toBeUndefined();
    expect(routeSeo('/models/openai/gpt-5.4')?.modified).toBeUndefined();
    const hostile = { name: '</script><script>alert(1)</script>\u2028\u2029' };
    const json = serializeJsonLd(hostile);
    expect(json).not.toContain('<');
    expect(JSON.parse(json)).toEqual(hostile);
  });

  it('recognizes production hosts and all utility paths precisely', () => {
    for (const host of ['kineticrouter.com', 'www.kineticrouter.com']) expect(isProductionHostname(host)).toBe(true);
    for (const host of ['localhost', '127.0.0.1', 'kineticrouter.com.example.org', 'preview.chatgpt.site']) expect(isProductionHostname(host)).toBe(false);
    for (const route of ['/account', '/account/sign-in?next=%2Fusage', '/console', '/console/api-keys', '/docs/search-index.json']) expect(isUtilityRoute(route)).toBe(true);
    expect(isUtilityRoute('/docs/develop/authentication')).toBe(false);
    expect(pageMetadata('/missing').robots).toMatchObject({ index: false });
    expect(pageMetadata('/missing').alternates).toBeUndefined();
  });

  it('preserves existing social image policies through metadata merging', () => {
    for (const route of ['/', '/quickstart', '/models', '/pricing', '/models/openai']) {
      expect(pageMetadata(route).openGraph).toMatchObject({ images: [{ url: '/og.jpg', width: 1200, height: 630, alt: 'kineticRouter' }] });
      expect(pageMetadata(route).twitter).toMatchObject({ card: 'summary_large_image', images: ['/og.jpg'] });
    }
    for (const route of ['/docs', '/docs/integrations/codex', '/models/openai/gpt-5.4']) {
      expect(pageMetadata(route).openGraph).toMatchObject({ images: [] });
      expect(pageMetadata(route).twitter).toMatchObject({ card: 'summary', images: [] });
    }
  });

  it('reduces list payloads while retaining every displayed price and search/sort field', () => {
    const projected = models.map(catalogModel);
    expect(JSON.stringify(projected).length).toBeLessThan(JSON.stringify(models).length * 0.4);
    for (let index = 0; index < models.length; index++) {
      const original = models[index]!;
      const model = projected[index]!;
      for (const role of ['sell', 'official'] as const) for (const component of ['input', 'output']) expect(usdPrice(model, role, component)).toBe(usdPrice(original, role, component));
      expect(displayContextWindow(model)).toBe(displayContextWindow(original));
      for (const key of ['name', 'id', 'slug', 'provider', 'tagline', 'date', 'capabilityFlags'] as const) expect(model[key]).toEqual(original[key]);
      expect(model).not.toHaveProperty('faq');
      expect(model).not.toHaveProperty('codeExamples');
    }
  });
});
