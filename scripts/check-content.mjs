import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const manifestUrl = new URL('data/hao-manifest.json', root);
const statusUrl = new URL('data/documentation-status.json', root);
const manifestBytes = await readFile(manifestUrl);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const status = JSON.parse(await readFile(statusUrl, 'utf8'));
const llms = await readFile(new URL('public/llms.txt', root), 'utf8');
const llmsFull = await readFile(new URL('public/llms-full.txt', root), 'utf8');
const homeHero = await readFile(new URL('components/home-hero.tsx', root), 'utf8');
const docsSitemap = await readFile(new URL('public/docs-sitemap.xml', root), 'utf8');

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const unique = (values) => new Set(values).size === values.length;
const sha256 = createHash('sha256').update(manifestBytes).digest('hex').toUpperCase();

expect(sha256 === '90CB02E22F118779B2F51D42CF7A2A5B185EF0D0FDE7816003E7C7AD57EC432C', `Hao snapshot hash changed: ${sha256}`);
expect(manifest.capturedAt === '2026-08-30', 'Unexpected or missing snapshot date');
expect(Array.isArray(manifest.officialSources) && manifest.officialSources.length > 0, 'Official source provenance is missing');
expect(manifest.notes && typeof manifest.notes === 'object', 'Snapshot notes are missing');
expect(manifest.docsRoutes.length === 57, `Expected 57 docs routes, found ${manifest.docsRoutes.length}`);
expect(manifest.modelFixture.models.length === 20, `Expected 20 models, found ${manifest.modelFixture.models.length}`);
expect(unique(manifest.docsRoutes), 'Duplicate docs routes found');
expect(unique(manifest.modelFixture.models.map((model) => model.id)), 'Duplicate model IDs found');
expect(manifest.docsRoutes.every((route) => manifest.docsMeta.some((item) => item.route === route)), 'A docs route is missing metadata');
expect(manifest.docsRoutes.every((route) => manifest.docsContent.some((item) => item.route === route)), 'A docs route is missing content');

const activePrices = manifest.modelFixture.models.flatMap((model) => model.prices).filter((price) => price.active);
expect(activePrices.length === 188, `Expected 188 active price rows, found ${activePrices.length}`);
expect(unique(activePrices.map((price) => price.id)), 'Duplicate active price IDs found');
expect(status.snapshot.modelCount === 20 && status.snapshot.docsRouteCount === 57, 'Status snapshot counts do not match the locked Hao snapshot');

for (const provider of ['anthropic', 'grok']) {
  const rule = status.rules.find((item) => item.provider === provider && item.status === 'planned');
  expect(Boolean(rule), `${provider} must remain planned until an authoritative route check passes`);
}

const routeStatus = (route) => status.rules.find((rule) => rule.route === route)?.status ?? status.rules.find((rule) => rule.prefix && route.startsWith(rule.prefix))?.status ?? status.default.status;
const indexableDocs = manifest.docsRoutes.filter((route) => routeStatus(route) !== 'planned');
const sitemapRoutes = [...docsSitemap.matchAll(/<loc>https:\/\/kineticrouter\.com([^<]+)<\/loc>/g)].map((match) => match[1]);
expect(JSON.stringify(sitemapRoutes) === JSON.stringify(indexableDocs), 'docs-sitemap.xml is out of sync with route availability');

const inventories = `${llms}\n${llmsFull}`;
expect(!/database-driven|live model catalog|live pricing/i.test(inventories), 'LLM exports still claim live/database-driven catalog data');
expect(!/DeepSeek/i.test(inventories), 'LLM exports list a provider absent from the snapshot');
expect(!inventories.includes('/docs/develop/advanced/model-routing'), 'LLM exports contain the removed model-routing path');
expect(!/api\.kineticrouter\.com\/(?:anthropic|grok\/v1)/i.test(homeHero), 'Landing hero exposes a planned provider endpoint');

if (failures.length) {
  console.error('Content checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Content checks passed: ${manifest.docsRoutes.length} docs, ${manifest.modelFixture.models.length} models, ${activePrices.length} active prices, ${sha256.slice(0, 12)}…`);
