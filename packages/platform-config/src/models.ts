import catalog from './model-catalog.json' with { type: 'json' };
import { activeProviderIds, type ActiveProviderId } from './providers.js';

export const catalogVerifiedAt = catalog.verifiedAt;
export const catalogPriceMultiplier = catalog.sellMultiplier;
export const providerSellMultipliers: Readonly<Partial<Record<ActiveProviderId, number>>> = catalog.providerSellMultipliers;
export function getCatalogPriceMultiplier(provider: ActiveProviderId) {
  return providerSellMultipliers[provider] ?? catalogPriceMultiplier;
}
export const defaultModelId = 'openai/gpt-6-astra';
export type ModelLifecycle = 'active' | 'deprecated';
export type PublicModelChoice = { id: string; slug: string; provider: ActiveProviderId; name: string; lifecycle: ModelLifecycle };
export type CatalogPriceProfile = {
  sourceUrl: string; contextWindow: number; maxOutput: number;
  inputModalities: string[]; outputModalities: string[];
  prices: Array<{ component: string; usd: number; tierLabel: string; unit: string }>;
  metadataSourceUrl?: string; sourceVerifiedAt?: string; releasedAt?: string; referenceModel?: string; pricingNote?: string;
};
export const modelPriceProfiles: Readonly<Record<string, CatalogPriceProfile>> = catalog.profiles;
export const publicModelDefinitions = catalog.models;

export const publicModelChoices: readonly PublicModelChoice[] = catalog.models.map((model) => {
  if (!(activeProviderIds as readonly string[]).includes(model.provider)) throw new Error(`Unknown catalog provider: ${model.provider}`);
  const lifecycle = model.lifecycle ?? 'active';
  if (lifecycle !== 'active' && lifecycle !== 'deprecated') throw new Error(`Unknown model lifecycle: ${lifecycle}`);
  return { id: `${model.provider}/${model.slug}`, slug: model.slug, provider: model.provider as ActiveProviderId, name: model.name, lifecycle };
});

if (new Set(publicModelChoices.map((model) => model.id)).size !== publicModelChoices.length) throw new Error('Duplicate public model ID.');

export function getPublicModel(id: string) {
  const model = publicModelChoices.find((item) => item.id === id);
  if (!model) throw new Error(`Unknown public model: ${id}`);
  return model;
}

export function defaultProviderModel(provider: ActiveProviderId) {
  const model = publicModelChoices.find((item) => item.provider === provider && item.lifecycle === 'active');
  if (!model) throw new Error(`Provider has no public model: ${provider}`);
  return model;
}

export type ExampleLanguage = 'python' | 'node' | 'curl';
export function openAICompatibleExamples(modelId: string, baseUrl: string): Record<ExampleLanguage, string> {
  getPublicModel(modelId);
  const endpoint = new URL(baseUrl);
  if (endpoint.pathname !== '/v1' || endpoint.search || endpoint.hash) throw new Error('Integration examples require a /v1 base URL.');
  return {
    python: `import os
from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}",
    api_key=os.environ["KINETICROUTER_API_KEY"],
)

response = client.chat.completions.create(
    model="${modelId}",
    messages=[{"role": "user", "content": "Hello!"}],
)

print(response.choices[0].message.content)`,
    node: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: process.env.KINETICROUTER_API_KEY,
});

const response = await client.chat.completions.create({
  model: "${modelId}",
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(response.choices[0].message.content);`,
    curl: `curl ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer $KINETICROUTER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelId}",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
  };
}
