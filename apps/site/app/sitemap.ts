import type { MetadataRoute } from 'next';
import { indexableRoutes, routeSeo } from '@/data/seo';
import { canonicalUrl } from '@/data/seo-policy.mjs';

export default function sitemap(): MetadataRoute.Sitemap {
  return indexableRoutes().map((route) => ({ url: canonicalUrl(route), ...(routeSeo(route)?.modified ? { lastModified: routeSeo(route)!.modified } : {}) }));
}
