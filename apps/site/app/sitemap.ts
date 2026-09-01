import type { MetadataRoute } from 'next';
import { docsRoutes, manifest } from '@/data/content';
import { documentationStatusFor } from '@/data/documentation';

export default function sitemap(): MetadataRoute.Sitemap {
  const indexableDocs = docsRoutes.filter((route) => documentationStatusFor(route).status !== 'planned');
  const routes = [...new Set([...manifest.mainRoutes.filter((route) => !route.startsWith('/account/')), ...indexableDocs])];
  return routes.map((route) => ({ url: `https://kineticrouter.com${route === '/' ? '' : route}`, changeFrequency: 'monthly', priority: route === '/' ? 1 : route === '/models' || route === '/docs' ? .9 : .7 }));
}
