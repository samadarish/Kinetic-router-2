import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { canonicalUrl, isIndexableRoute, SITE_ORIGIN } from '../apps/site/data/seo-policy.mjs';
import { documentationRouteStatus } from '../apps/site/scripts/provider-availability.mjs';

const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const origin = option('origin') ?? 'http://localhost:3000';
const requestHost = option('host');
const production = process.argv.includes('--production');
const baseline = option('baseline') ? JSON.parse(await readFile(option('baseline'), 'utf8')) : undefined;
const manifest = JSON.parse(await readFile(new URL('../apps/site/data/reference-manifest.json', import.meta.url), 'utf8'));
const additions = JSON.parse(await readFile(new URL('../apps/site/data/catalog-additions.json', import.meta.url), 'utf8'));
manifest.mainRoutes = [...new Set([...manifest.mainRoutes, ...additions.models.map((model) => `/models/${model.provider}/${model.slug}`)])];
const statuses = JSON.parse(await readFile(new URL('../apps/site/data/documentation-status.json', import.meta.url), 'utf8'));
const routes = [...manifest.mainRoutes.filter((route) => !route.startsWith('/account')), ...manifest.docsRoutes, '/docs/en'];
const failures = [];
const results = {};
const check = (condition, message) => { if (!condition) failures.push(message); };
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const withoutScripts = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
function visibleSignature(html) {
  const body = withoutScripts(html).match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '';
  const clean = body.replace(/<(?:style|title)\b[^>]*>[\s\S]*?<\/(?:style|title)>/gi, '').replace(/<(?:meta|link)\b[^>]*>/gi, '');
  return {
    text: clean.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
    classes: [...clean.matchAll(/\bclass="([^"]*)"/g)].map((m) => m[1]),
    images: [...clean.matchAll(/<img\b[^>]*>/g)].map((m) => attributes(m[0])),
  };
}
async function request(route, userAgent = 'Twitterbot/1.0') {
  // Node's fetch ignores a custom Host header. Use HTTP directly to exercise a
  // local production server with the real deployment hostname.
  if (requestHost) return new Promise((resolve, reject) => {
    const url = new URL(origin + route);
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(url, { headers: { 'User-Agent': userAgent, Host: requestHost } }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, html: Buffer.concat(chunks).toString('utf8') }));
    });
    req.setTimeout(90_000, () => req.destroy(new Error('HTTP audit request timed out')));
    req.on('error', reject);
    req.end();
  });
  const response = await fetch(origin + route, { redirect: 'manual', headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(90_000) });
  return { status: response.status, headers: Object.fromEntries(response.headers), html: await response.text() };
}
for (let i = 0; i < routes.length; i += 4) {
  await Promise.all(routes.slice(i, i + 4).map(async (route) => {
    try {
      const result = await request(route);
      results[route] = { status: result.status, bytes: Buffer.byteLength(result.html) };
      check(result.status === 200, `${route}: HTTP ${result.status}`);
      const html = withoutScripts(result.html);
      const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';
      const tags = [...html.matchAll(/<(?:meta|link)\b[^>]*>/g)].map((m) => attributes(m[0]));
      const canonical = tags.filter((tag) => tag.rel === 'canonical');
      check(canonical.length === 1 && canonical[0].href === canonicalUrl(route), `${route}: canonical mismatch`);
      check(head.includes(`href="${canonicalUrl(route)}"`), `${route}: canonical missing from blocking metadata head`);
      const titles = [...html.matchAll(/<title>([\s\S]*?)<\/title>/g)];
      check(titles.length === 1 && (titles[0][1].match(/kineticRouter/g) ?? []).length === 1, `${route}: title/branding mismatch`);
      check(tags.filter((tag) => tag.name === 'description' && tag.content).length === 1, `${route}: description missing/duplicated`);
      check(tags.find((tag) => tag.property === 'og:url')?.content === canonicalUrl(route), `${route}: OG URL mismatch`);
      const detailed = route.startsWith('/docs') || /^\/models\/(openai|anthropic|grok)\/[^/]+$/.test(route);
      for (const [attribute, name] of [['property', 'og:image'], ['name', 'twitter:image']]) {
        const images = tags.filter((tag) => tag[attribute] === name).map((tag) => tag.content);
        check(JSON.stringify(images) === JSON.stringify(detailed ? [] : [SITE_ORIGIN + '/og.jpg']), `${route}: ${name} policy changed`);
      }
      check((html.match(/<h1\b/g) ?? []).length === 1, `${route}: H1 missing/duplicated`);
      const planned = documentationRouteStatus(route, statuses) === 'planned';
      const noindex = tags.some((tag) => tag.name === 'robots' && tag.content?.includes('noindex'));
      check(noindex === planned, `${route}: incorrect page indexing directive`);
      check(production ? !result.headers['x-robots-tag']?.includes('noindex') : result.headers['x-robots-tag']?.includes('noindex'), `${route}: incorrect host indexing directive`);
      const schemas = [...result.html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
      check(planned ? schemas.length === 0 : schemas.length === 1, `${route}: structured-data count`);
      for (const schema of schemas) {
        const graph = JSON.parse(schema[1])['@graph'];
        check(graph.some((entry) => entry.url === canonicalUrl(route)), `${route}: schema URL mismatch`);
      }
      if (baseline?.[route]) {
        const before = visibleSignature(baseline[route].html);
        const after = visibleSignature(result.html);
        for (const key of ['text', 'classes', 'images']) {
          try { assert.deepEqual(after[key], before[key]); }
          catch { failures.push(`${route}: visible ${key} changed`); results[route][`${key}Difference`] = { before: before[key], after: after[key] }; }
        }
      }
    } catch (error) { failures.push(`${route}: ${error.message}`); }
  }));
}
const indexable = [...new Set([...manifest.mainRoutes, ...manifest.docsRoutes])].filter((route) => isIndexableRoute(route, documentationRouteStatus(route, statuses)));
for (const path of ['/sitemap.xml', '/docs-sitemap.xml']) {
  const response = await request(path);
  check(response.status === 200, `${path}: HTTP ${response.status}`);
  const expected = (path === '/sitemap.xml' ? indexable : indexable.filter((route) => route.startsWith('/docs'))).map(canonicalUrl);
  const actual = [...response.html.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  try { assert.deepEqual(actual, expected); } catch { failures.push(`${path}: sitemap coverage differs from canonical pages`); }
}
const robots = await request('/robots.txt');
check(robots.status === 200 && robots.html.includes(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`) && !robots.html.includes('Disallow: /'), 'robots.txt must allow crawling and advertise sitemap');
for (const route of ['/account/sign-in', '/account/sign-up', '/account/verify-email', '/console', '/console/api-keys', '/docs/search-index.json']) {
  const response = await request(route);
  check(response.headers['x-robots-tag']?.includes('noindex'), `${route}: utility response needs noindex header`);
  check(route.endsWith('.json') ? response.status === 200 : response.status >= 300 && response.status < 400 && !!response.headers.location, `${route}: utility response/redirect failed`);
}
for (const route of ['/seo-check-missing-page', '/models/unknown', '/models/openai/unknown', '/docs/unknown']) {
  const response = await request(route);
  check(response.status === 404, `${route}: expected real 404, got ${response.status}`);
  check(!withoutScripts(response.html).includes('rel="canonical"'), `${route}: error must not inherit homepage canonical`);
  check(/name="robots"[^>]*noindex/.test(response.html) || response.headers['x-robots-tag']?.includes('noindex'), `${route}: missing noindex on error`);
}
// Ordinary browser and Googlebot responses may stream metadata; the complete HTML must still agree.
for (const agent of ['Mozilla/5.0', 'Googlebot']) {
  const response = await request('/models/openai/gpt-5.4', agent);
  const html = withoutScripts(response.html);
  check((html.match(/rel="canonical"/g) ?? []).length === 1 && html.includes(canonicalUrl('/models/openai/gpt-5.4')), `${agent}: streamed canonical mismatch`);
}
await mkdir(new URL('../.cache/seo/', import.meta.url), { recursive: true });
await writeFile(new URL('../.cache/seo/report.json', import.meta.url), JSON.stringify({ origin, pages: routes.length, failures, results }, null, 2));
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`SEO HTTP checks passed: ${routes.length} pages, ${indexable.length} canonical URLs, sitemaps, robots, redirects, errors${baseline ? ', and unchanged visible content/classes/images' : ''}.`);
