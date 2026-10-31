import { readFile, writeFile } from 'node:fs/promises';
import { documentationRouteStatus } from './provider-availability.mjs';

const root = new URL('../', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('../../packages/platform-config/src/model-catalog.json', root), 'utf8'));
const registry = JSON.parse(await readFile(new URL('../../packages/platform-config/src/provider-registry.json', root), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('data/reference-manifest.json', root), 'utf8'));
const status = JSON.parse(await readFile(new URL('data/documentation-status.json', root), 'utf8'));
const origin = 'https://kineticrouter.com';
const modelLines = catalog.models.map((model) => `- ${registry.providers[model.provider].label}: ${model.name}${model.lifecycle === 'deprecated' ? ' (Deprecated)' : ''} — ${origin}/models/${model.provider}/${model.slug}`).join('\n');
const providerLines = Object.keys(registry.providers).filter((id) => id !== 'meta').map((id) => `- ${registry.providers[id].label}: ${origin}/models/${id}`).join('\n');
const discountSummary = Object.entries(registry.providers).filter(([id]) => id !== 'meta').map(([id, provider]) => `${provider.label}: ${Math.round((1 - (catalog.providerSellMultipliers[id] ?? catalog.sellMultiplier)) * 100)}% off`).join('; ');
const latestVerifiedAt = Object.values(catalog.profiles).map((profile) => profile.sourceVerifiedAt ?? catalog.verifiedAt).sort().at(-1);
const deprecatedCount = catalog.models.filter((model) => model.lifecycle === 'deprecated').length;
const policy = `The current public catalog contains ${catalog.models.length} listed models across 8 providers, including ${deprecatedCount} deprecated model. Official reference rates use verification dates from ${catalog.verifiedAt} through ${latestVerifiedAt}. Display discounts by provider: ${discountSummary}. These discounts apply to published input, output, cache, tiered, and image-token components. Deprecated models are marked explicitly instead of displaying a discount badge. Variants without separate official rates use their named base model's rates. The original August 30, 2026 archive is retained separately.

Every active provider uses the OpenAI-compatible https://api.kineticrouter.com/v1 base URL, or https://cdn-api.kineticrouter.com/v1. Use provider/model IDs and a kineticRouter API key. Meta support is planned and has no active catalog entries. Public display prices are separate from actual account billing; the authenticated customer console reports billed usage and account rates.`;
const primary = ['/', '/models', '/pricing', '/docs', '/quickstart'].map((path) => `- ${origin}${path}`).join('\n');
const availableDocs = manifest.docsRoutes.filter((route) => documentationRouteStatus(route, status) !== 'planned');
const pendingDocs = manifest.docsRoutes.filter((route) => documentationRouteStatus(route, status) === 'planned');
const files = {
  'llms.txt': `# kineticRouter\n\n> Public documentation and model pricing index.\n\n## Catalog and availability\n\n${policy}\n\n## Primary pages\n\n${primary}\n- Customer console: https://console.kineticrouter.com/sign-in\n\n## Providers\n\n${providerLines}\n\n## Models\n\n${modelLines}\n\n## API references\n\n- Chat completions: ${origin}/docs/api/openai/chat-completions\n- Responses: ${origin}/docs/api/openai/responses\n- Model discovery: ${origin}/docs/api/openai/models\n- SDK setup: ${origin}/docs/integrations/openai-sdk\n`,
  'llms-full.txt': `# kineticRouter — complete public documentation inventory\n\nCanonical site: ${origin}\nCustomer console: https://console.kineticrouter.com/sign-in\n\n## Interpretation\n\n${policy}\n\n## Main pages\n\n${primary}\n\n## Providers\n\n${providerLines}\n\n## Models\n\n${modelLines}\n\n## Reference documentation\n\n${availableDocs.map((route) => `- ${origin}${route}`).join('\n')}\n\n## Pending platform references — noindex\n\n${pendingDocs.map((route) => `- ${origin}${route}`).join('\n')}\n\n## Crawler guidance\n\nUse canonical URLs and respect planned/noindex statuses. Model metadata does not establish a particular account's model access.\n`,
};
for (const [name, content] of Object.entries(files)) {
  const url = new URL(`public/${name}`, root);
  if (process.argv.includes('--check')) {
    if (await readFile(url, 'utf8') !== content) throw new Error(`${name} is stale. Run npm run sync:model-inventory -w @kineticrouter/site.`);
  } else await writeFile(url, content);
}
console.log(`${process.argv.includes('--check') ? 'Checked' : 'Updated'} model inventories: ${catalog.models.length} models.`);
