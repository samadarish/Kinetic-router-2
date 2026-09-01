import { describe, expect, it } from 'vitest';
import { DEFAULT_PUBLIC_SITE_ORIGIN, resolvePublicSiteOrigin } from './public-site';

describe('public site origin', () => {
  it('uses an explicit valid HTTP origin and strips its path', () => {
    expect(resolvePublicSiteOrigin('https://preview.kineticrouter.com/site/')).toBe('https://preview.kineticrouter.com');
  });

  it.each([
    ['http://127.0.0.1:5174', 'http://127.0.0.1:3000'],
    ['http://localhost:5174', 'http://localhost:3000'],
  ])('points a local portal at the local public site for %s', (portalOrigin, expected) => {
    expect(resolvePublicSiteOrigin(undefined, portalOrigin)).toBe(expected);
  });

  it('falls back to the production public site for non-local or invalid input', () => {
    expect(resolvePublicSiteOrigin('javascript:alert(1)', 'https://console.kineticrouter.com')).toBe(DEFAULT_PUBLIC_SITE_ORIGIN);
  });
});
