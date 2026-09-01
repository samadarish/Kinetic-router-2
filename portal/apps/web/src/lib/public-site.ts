export const DEFAULT_PUBLIC_SITE_ORIGIN = 'https://kineticrouter.com';

export function resolvePublicSiteOrigin(configuredOrigin?: string, currentOrigin?: string) {
  const configured = normalizeHttpOrigin(configuredOrigin);
  if (configured) return configured;

  const current = parseUrl(currentOrigin);
  if (current && isLoopbackHost(current.hostname)) {
    current.port = '3000';
    current.pathname = '';
    current.search = '';
    current.hash = '';
    return current.origin;
  }

  return DEFAULT_PUBLIC_SITE_ORIGIN;
}

const browserOrigin = typeof window === 'undefined' ? undefined : window.location.origin;

export const publicSiteOrigin = resolvePublicSiteOrigin(
  import.meta.env.VITE_PUBLIC_SITE_ORIGIN,
  browserOrigin,
);

export function publicSiteHref(path = '/') {
  return new URL(path, `${publicSiteOrigin}/`).toString();
}

function normalizeHttpOrigin(value?: string) {
  const parsed = parseUrl(value?.trim());
  if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) return undefined;
  return parsed.origin;
}

function parseUrl(value?: string) {
  if (!value) return undefined;
  try { return new URL(value); } catch { return undefined; }
}

function isLoopbackHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}
