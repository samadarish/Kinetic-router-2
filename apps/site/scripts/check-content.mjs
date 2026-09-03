import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { documentationRouteStatus, providerAvailability, providerForAlias } from './provider-availability.mjs';

const root = new URL('../', import.meta.url);
const manifestUrl = new URL('data/reference-manifest.json', root);
const statusUrl = new URL('data/documentation-status.json', root);
const manifestBytes = await readFile(manifestUrl);
const manifestJson = manifestBytes.toString('utf8');
const manifest = JSON.parse(manifestJson);
const status = JSON.parse(await readFile(statusUrl, 'utf8'));
const llms = await readFile(new URL('public/llms.txt', root), 'utf8');
const llmsFull = await readFile(new URL('public/llms-full.txt', root), 'utf8');
const homeHero = await readFile(new URL('components/home-hero.tsx', root), 'utf8');
const docsSitemap = await readFile(new URL('public/docs-sitemap.xml', root), 'utf8');
const docsNavigationSource = await readFile(new URL('data/docs-navigation.ts', root), 'utf8');

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const unique = (values) => new Set(values).size === values.length;
const sha256 = createHash('sha256').update(manifestJson.replace(/\r\n/g, '\n')).digest('hex').toUpperCase();

expect(sha256 === '0E34F76F9BC701DF878CD202683F5B9F3952D5D1A41BA9016F601463EB2ACC8C', `Reference snapshot hash changed: ${sha256}`);
expect(manifest.capturedAt === '2026-08-30', 'Unexpected or missing snapshot date');
expect(Array.isArray(manifest.officialSources) && manifest.officialSources.length > 0, 'Official source provenance is missing');
expect(manifest.notes && typeof manifest.notes === 'object', 'Snapshot notes are missing');
expect(manifest.docsRoutes.length === 57, `Expected 57 docs routes, found ${manifest.docsRoutes.length}`);
expect(manifest.modelFixture.models.length === 20, `Expected 20 models, found ${manifest.modelFixture.models.length}`);
expect(unique(manifest.docsRoutes), 'Duplicate docs routes found');
expect(unique(manifest.modelFixture.models.map((model) => model.id)), 'Duplicate model IDs found');
expect(manifest.docsRoutes.every((route) => manifest.docsMeta.some((item) => item.route === route)), 'A docs route is missing metadata');
expect(manifest.docsRoutes.every((route) => manifest.docsContent.some((item) => item.route === route)), 'A docs route is missing content');
expect(!/kineticrouter\.com\/console\/(?:api-keys|overview)/i.test(manifestJson), 'Reference snapshot contains a stale customer-console URL');
expect(!/\/console\/(?:chat|image)\b|"LanguageSwitcher"|"chatCta"\s*:/i.test(manifestJson), 'Reference snapshot contains a retired public control');
expect(!/GitHub Repository<!-- -->/.test(manifestJson), 'Documentation labels the documentation homepage as a GitHub repository');

const activePrices = manifest.modelFixture.models.flatMap((model) => model.prices).filter((price) => price.active);
expect(activePrices.length === 188, `Expected 188 active price rows, found ${activePrices.length}`);
expect(unique(activePrices.map((price) => price.id)), 'Duplicate active price IDs found');
expect(status.snapshot.modelCount === 20 && status.snapshot.docsRouteCount === 57, 'Status snapshot counts do not match the locked reference snapshot');
expect(providerAvailability.version === 1 && providerAvailability.displayOnly === true, 'Provider availability registry metadata is invalid');
expect(providerAvailability.checkedAt >= manifest.capturedAt, 'Provider availability fact check cannot predate the reference snapshot');
const providerAliasOwners = new Map();
for (const [id, provider] of Object.entries(providerAvailability.providers)) {
  expect(provider.protocolSources.length > 0, `${id} is missing authoritative protocol sources`);
  expect((provider.baseUrl || provider.previewBaseUrl) && !(provider.baseUrl && provider.previewBaseUrl), `${id} must expose exactly one display endpoint`);
  for (const alias of [id, ...provider.aliases]) {
    const normalized = alias.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const owner = providerAliasOwners.get(normalized);
    expect(!owner || owner === id, `Provider alias ${alias} belongs to both ${owner} and ${id}`);
    providerAliasOwners.set(normalized, id);
  }
}

for (const provider of ['anthropic', 'grok']) {
  const providerStatus = providerForAlias(provider);
  expect(providerStatus?.apiState === 'planned' && providerStatus.interactionMode === 'reference-only', `${provider} must remain reference-only until an authoritative route check passes`);
}
expect(providerForAlias('codex')?.apiState === 'verified', 'Codex must resolve through the available OpenAI provider status');
expect(providerForAlias('claude')?.apiState === 'planned', 'Claude must resolve through the Anthropic provider status');

const indexableDocs = manifest.docsRoutes.filter((route) => documentationRouteStatus(route, status) !== 'planned');
const sitemapRoutes = [...docsSitemap.matchAll(/<loc>https:\/\/kineticrouter\.com([^<]+)<\/loc>/g)].map((match) => match[1]);
expect(JSON.stringify(sitemapRoutes) === JSON.stringify(indexableDocs), 'docs-sitemap.xml is out of sync with route availability');

const inventories = `${llms}\n${llmsFull}`;
expect(!/database-driven|live model catalog|live pricing/i.test(inventories), 'LLM exports still claim live/database-driven catalog data');
expect(!/DeepSeek/i.test(inventories), 'LLM exports list a provider absent from the snapshot');
expect(!inventories.includes('/docs/develop/advanced/model-routing'), 'LLM exports contain the removed model-routing path');
expect(!/api\.kineticrouter\.com\/(?:anthropic|grok\/v1)/i.test(homeHero), 'Landing hero exposes a planned provider endpoint');
expect((homeHero.match(/<h1\b/g) ?? []).length === 1, 'Landing hero must contain exactly one semantic h1');
expect(homeHero.includes('{home.title}<span className="home-hero-period">.</span>'), 'Landing hero must render the gradient period as HTML text');
expect(/<img[\s\S]*?alt=""[\s\S]*?aria-hidden="true"[\s\S]*?fetchPriority="high"/.test(homeHero), 'Landing hero image must be decorative and loaded with high priority');

const navigationRoutes = [...docsNavigationSource.matchAll(/href:\s*'([^']+)'/g)].map((match) => match[1]);
expect(navigationRoutes.length === manifest.docsRoutes.length && unique(navigationRoutes), 'Docs navigation must contain each captured docs route exactly once');
expect(manifest.docsRoutes.every((route) => navigationRoutes.includes(route)), 'Docs navigation is missing an imported documentation route');
const integrationRoutes = manifest.docsRoutes.filter((route) => route.startsWith('/docs/integrations/') && route !== '/docs/integrations');
expect(integrationRoutes.every((route) => manifest.docsContent.find((item) => item.route === route)?.html.includes('docs-meta-title-icon')), 'An integration page is missing its captured tool icon');

if (failures.length) {
  console.error('Content checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Content checks passed: ${manifest.docsRoutes.length} docs, ${manifest.modelFixture.models.length} models, ${activePrices.length} active prices, ${sha256.slice(0, 12)}…`);
