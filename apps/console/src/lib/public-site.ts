import {
  PRODUCTION_ORIGINS,
  publicSiteHref as sharedPublicSiteHref,
  resolvePublicSiteOrigin as sharedResolvePublicSiteOrigin,
} from '@kineticrouter/platform-config/origins';

export const DEFAULT_PUBLIC_SITE_ORIGIN = PRODUCTION_ORIGINS.publicSite;

export function resolvePublicSiteOrigin(configuredOrigin?: string, currentOrigin?: string) {
  return sharedResolvePublicSiteOrigin({ configuredOrigin, runtimeOrigin: currentOrigin });
}

const browserOrigin = typeof window === 'undefined' ? undefined : window.location.origin;
export const publicSiteOrigin = resolvePublicSiteOrigin(import.meta.env.VITE_PUBLIC_SITE_ORIGIN, browserOrigin);
export function publicSiteHref(path = '/') { return sharedPublicSiteHref(path, publicSiteOrigin); }
