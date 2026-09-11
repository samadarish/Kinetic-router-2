import { PRODUCTION_ORIGINS } from '@kineticrouter/platform-config/origins';

export const SITE_ORIGIN = PRODUCTION_ORIGINS.publicSite;
export const canonicalAliases = Object.freeze({
  '/quickstart': '/docs/develop',
  '/models/category/chat': '/models',
  '/docs/en': '/docs',
  '/docs/integrations/codex/installation': '/docs/integrations/codex',
  '/docs/integrations/codex/model-provider': '/docs/integrations/codex',
  '/docs/integrations/codex/websocket': '/docs/integrations/codex',
});

/** Normalize paths only; callers never derive the canonical origin from request headers. */
export function canonicalPath(route) {
  const pathname = route.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
  return canonicalAliases[pathname] ?? pathname;
}

export function canonicalUrl(route) {
  const path = canonicalPath(route);
  return `${SITE_ORIGIN}${path === '/' ? '' : path}`;
}

export function isUtilityRoute(route) {
  const path = route.split(/[?#]/, 1)[0];
  return /^\/(?:account|console)(?:\/|$)/.test(path) || path === '/docs/search-index.json';
}

export function isIndexableRoute(route, status) {
  return !isUtilityRoute(route) && status !== 'planned' && canonicalPath(route) === route;
}

export function isProductionHostname(hostname) {
  return hostname === 'kineticrouter.com' || hostname === 'www.kineticrouter.com';
}

export function serializeJsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
