import type { MetadataRoute } from 'next';
import { SITE_ORIGIN } from '@/data/seo-policy.mjs';

export default function robots(): MetadataRoute.Robots {
  // Allow crawling so canonical and noindex directives can be read, including redirects.
  return { rules: { userAgent: '*', allow: '/' }, sitemap: [SITE_ORIGIN + '/sitemap.xml', SITE_ORIGIN + '/docs-sitemap.xml'] };
}
