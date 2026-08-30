import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('data/hao-manifest.json', root), 'utf8'));
const status = JSON.parse(await readFile(new URL('data/documentation-status.json', root), 'utf8'));
const routeStatus = (route) => status.rules.find((rule) => rule.route === route)?.status ?? status.rules.find((rule) => rule.prefix && route.startsWith(rule.prefix))?.status ?? status.default.status;
const routes = manifest.docsRoutes.filter((route) => routeStatus(route) !== 'planned');
const entries = routes.map((route) => `  <url>\n    <loc>https://kineticrouter.com${route}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`).join('\n');
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
await writeFile(new URL('public/docs-sitemap.xml', root), xml, 'utf8');
console.log(`Generated docs-sitemap.xml with ${routes.length} indexable routes.`);
