import { activeProviderIds } from '@kineticrouter/platform-config/providers';
import type { Metadata } from 'next';
import { getDocsPage, manifest, models } from './content';
import { providerDisplayStatus } from './provider-availability';
import { canonicalPath, canonicalUrl, isIndexableRoute, SITE_ORIGIN } from './seo-policy.mjs';

const pages: Record<string, { title: string; description: string }> = {
  '/': { title: 'AI API Access & Model Reference', description: 'Access leading AI models through one OpenAI-compatible /v1 API. Explore model reference pricing, API documentation, and coding-agent setup guides.' },
  '/models': { title: 'AI Models & API Pricing Reference', description: 'Browse 36 models from OpenAI, Anthropic, Gemini, DeepSeek, Zhipu, Moonshot, Grok, and MiniMax. Compare reference pricing, context limits, and capabilities with kineticRouter provider availability.' },
  '/pricing': { title: 'AI API Pricing Comparison', description: 'Compare kineticRouter prices at 90% off official reference rates across eight AI providers. Check the customer console for actual billed rates.' },
  '/vibe-coding': { title: 'Codex & Claude Code Integration', description: 'Connect Codex and Claude Code to kineticRouter with the shared OpenAI-compatible /v1 route. Follow the setup guides with your API key.' },
  '/privacy': { title: 'Privacy Policy', description: 'Read how kineticRouter handles account information, API requests, usage data, payments, security, and privacy choices.' },
  '/terms-of-service': { title: 'Terms of Service', description: 'Read the kineticRouter terms for accounts, AI API access, usage, payments, content, service availability, and support.' },
};

export function routeSeo(requestedRoute: string) {
  const route = canonicalPath(requestedRoute);
  const doc = route.startsWith('/docs') ? getDocsPage(route) : undefined;
  let details = pages[route];
  let kind: 'WebPage' | 'CollectionPage' | 'TechArticle' = 'WebPage';
  let modified: string | undefined;
  if (doc?.meta) {
    details = { title: doc.meta.title, description: `${doc.meta.description} ${doc.status.status === 'planned' ? doc.status.summary : doc.status.guide ? 'Verify model access and protocol support with your account.' : 'Reference documentation; confirm kineticRouter availability before integrating.'}` };
    kind = ['/', '/docs', '/docs/api', '/docs/integrations'].includes(route) ? 'CollectionPage' : 'TechArticle';
    modified = doc.status.guide?.updatedAt;
  }
  if (route === '/models' || route === '/pricing') kind = 'CollectionPage';
  const providerSlug = /^\/models\/([^/]+)$/.exec(route)?.[1];
  const provider = activeProviderIds.find((id) => id === providerSlug);
  if (provider) {
    const status = providerDisplayStatus(provider);
    details = { title: `${status.label} Models & API Pricing Reference`, description: `Explore ${status.label} model reference prices, context limits, and capabilities. The kineticRouter ${status.protocolLabel} route is ${status.badgeLabel.toLowerCase()}; confirm model access in your account.` };
    kind = 'CollectionPage';
  }
  const model = models.find((item) => `/models/${item.provider}/${item.slug}` === route);
  if (model) {
    const status = providerDisplayStatus(model.provider);
    details = { title: `${model.name.replace(/^[^:]+:\s*/, '')} API & Reference Pricing`, description: `${model.name.replace(/^[^:]+:\s*/, '')} reference pricing, context limits, capabilities, and route availability. ${status.label} model access on kineticRouter is ${status.modelAccessState}; confirm actual rates in your console.` };
  }
  if (!details) return undefined;
  // Some imported titles already include branding. Apply it exactly once.
  const title = details.title.replace(/^kineticRouter\s+/i, '').replace(/\s+(?:[-—|])\s+kineticRouter(?:\.com)?$/i, '').trim();
  return { route, title, description: details.description.replace(/\s+/g, ' ').trim(), kind, modified, planned: doc?.status.status === 'planned', model };
}

export function pageMetadata(route: string): Metadata {
  const seo = routeSeo(route);
  if (!seo) return { title: { absolute: 'Page not found — kineticRouter' }, robots: { index: false, follow: true } };
  const title = /\bkineticRouter\b/i.test(seo.title) ? seo.title : `${seo.title} — kineticRouter`;
  const detailed = route.startsWith('/docs') || !!seo.model;
  return {
    title: { absolute: title }, description: seo.description,
    alternates: { canonical: canonicalUrl(route) },
    robots: seo.planned ? { index: false, follow: true } : { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
    openGraph: { type: 'website', url: canonicalUrl(route), siteName: 'kineticRouter', title, description: seo.description, images: detailed ? [] : [{ url: '/og.jpg', width: 1200, height: 630, alt: 'kineticRouter' }] },
    twitter: { card: detailed ? 'summary' : 'summary_large_image', title, description: seo.description, images: detailed ? [] : ['/og.jpg'] },
  };
}

export function indexableRoutes() {
  return [...new Set([...manifest.mainRoutes, ...manifest.docsRoutes])].filter((route) =>
    isIndexableRoute(route, route.startsWith('/docs') ? getDocsPage(route).status.status : undefined),
  );
}

export function structuredData(route: string) {
  const seo = routeSeo(route);
  if (!seo || seo.planned) return undefined;
  const url = canonicalUrl(route);
  const organization = `${SITE_ORIGIN}/#organization`;
  const website = `${SITE_ORIGIN}/#website`;
  const graph: Record<string, unknown>[] = [];
  if (seo.route === '/') {
    graph.push(
      { '@type': 'Organization', '@id': organization, name: 'kineticRouter', url: SITE_ORIGIN, logo: `${SITE_ORIGIN}/icon-512.png` },
      { '@type': 'WebSite', '@id': website, name: 'kineticRouter', url: SITE_ORIGIN, inLanguage: 'en', publisher: { '@id': organization } },
    );
  }
  const parts = seo.route.split('/').filter(Boolean);
  const breadcrumbs = [{ '@type': 'ListItem', position: 1, name: 'kineticRouter', item: canonicalUrl('/') }];
  for (let index = 0; index < parts.length; index++) {
    const path = `/${parts.slice(0, index + 1).join('/')}`;
    const parent = routeSeo(path);
    if (parent) breadcrumbs.push({ '@type': 'ListItem', position: breadcrumbs.length + 1, name: parent.title, item: canonicalUrl(path) });
  }
  const breadcrumbId = `${url}#breadcrumb`;
  if (breadcrumbs.length > 1) graph.push({ '@type': 'BreadcrumbList', '@id': breadcrumbId, itemListElement: breadcrumbs });
  graph.push({
    '@type': seo.kind, '@id': `${url}#webpage`, url, name: seo.title, description: seo.description,
    inLanguage: 'en', isPartOf: { '@id': website }, publisher: { '@id': organization },
    ...(seo.modified ? { dateModified: seo.modified } : {}),
    ...(breadcrumbs.length > 1 ? { breadcrumb: { '@id': breadcrumbId } } : {}),
  });
  return { '@context': 'https://schema.org', '@graph': graph };
}
