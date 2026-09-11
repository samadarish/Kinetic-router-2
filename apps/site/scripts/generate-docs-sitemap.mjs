import { readFile, writeFile } from 'node:fs/promises';
import { canonicalUrl, isIndexableRoute } from '../data/seo-policy.mjs';
import { documentationRouteStatus } from './provider-availability.mjs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('data/reference-manifest.json', root), 'utf8'));
const status = JSON.parse(await readFile(new URL('data/documentation-status.json', root), 'utf8'));
const routes = manifest.docsRoutes.filter((route) => isIndexableRoute(route, documentationRouteStatus(route, status)));
const entries = routes.map((route) => `  <url>\n    <loc>${canonicalUrl(route)}</loc>\n  </url>`).join('\n');
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
await writeFile(new URL('public/docs-sitemap.xml', root), xml, 'utf8');
console.log(`Generated docs-sitemap.xml with ${routes.length} indexable routes.`);
