import {
  getProviderDisplayEndpoint,
  getProviderDisplayStatus,
  providerDisplayIds,
} from './provider-display-status';

export const integrationProviderIds = [...providerDisplayIds, 'deepseek', 'zhipu', 'moonshot'] as const;
export type IntegrationProviderId = typeof integrationProviderIds[number];
export const integrationLanguages = ['python', 'node', 'curl'] as const;
export type IntegrationLanguage = typeof integrationLanguages[number];
export const integrationRouteIds = ['direct', 'cloudflare'] as const;
export type IntegrationRouteId = typeof integrationRouteIds[number];

const openaiDisplay = getProviderDisplayStatus('openai');
const integrationProviders = {
  openai: { ...openaiDisplay, model: 'openai/gpt-5.4' },
  anthropic: { ...getProviderDisplayStatus('anthropic'), model: 'anthropic/claude-opus-4.8' },
  grok: { ...getProviderDisplayStatus('grok'), model: 'grok/grok-4.6' },
  deepseek: { ...openaiDisplay, id: 'deepseek', label: 'DeepSeek', model: 'deepseek/deepseek-flash' },
  zhipu: { ...openaiDisplay, id: 'zhipu', label: 'Zhipu', model: 'zhipu/glm-5.3-flash' },
  moonshot: { ...openaiDisplay, id: 'moonshot', label: 'Moonshot', model: 'moonshot/kimi-k3' },
} as const;

export const integrationRoutes = {
  direct: { label: 'Direct API', origin: new URL(getProviderDisplayEndpoint('openai')).origin },
  cloudflare: { label: 'Cloudflare CDN', origin: 'https://cdn-api.kineticrouter.com' },
} as const;

export function getIntegrationProvider(id: IntegrationProviderId) {
  return integrationProviders[id];
}

export function getIntegrationEndpoint(providerId: IntegrationProviderId, routeId: IntegrationRouteId) {
  const directEndpoint = getProviderDisplayEndpoint(getIntegrationProvider(providerId));
  if (routeId === 'direct') return directEndpoint;
  const endpoint = new URL(directEndpoint);
  endpoint.host = new URL(integrationRoutes.cloudflare.origin).host;
  return endpoint.toString();
}

export function getIntegrationExamples(providerId: IntegrationProviderId, routeId: IntegrationRouteId): Record<IntegrationLanguage, string> {
  const provider = getIntegrationProvider(providerId);
  const endpoint = getIntegrationEndpoint(providerId, routeId);
  if (providerId === 'anthropic') return {
    python: `import anthropic

client = anthropic.Anthropic(
    base_url="${endpoint}",
    api_key="YOUR_KINETICROUTER_API_KEY",
)

message = client.messages.create(
    model="${provider.model}",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}],
)

print(message.content[0].text)`,
    node: `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  baseURL: "${endpoint}",
  apiKey: "YOUR_KINETICROUTER_API_KEY",
});

const message = await client.messages.create({
  model: "${provider.model}",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(message.content[0].text);`,
    curl: `curl ${endpoint}/v1/messages \\
  -H "x-api-key: YOUR_KINETICROUTER_API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${provider.model}",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
  };
  return {
    python: `from openai import OpenAI

client = OpenAI(
    base_url="${endpoint}",
    api_key="YOUR_KINETICROUTER_API_KEY",
)

response = client.chat.completions.create(
    model="${provider.model}",
    messages=[{"role": "user", "content": "Hello!"}],
)

print(response.choices[0].message.content)`,
    node: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${endpoint}",
  apiKey: "YOUR_KINETICROUTER_API_KEY",
});

const response = await client.chat.completions.create({
  model: "${provider.model}",
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(response.choices[0].message.content);`,
    curl: `curl ${endpoint}/chat/completions \\
  -H "Authorization: Bearer YOUR_KINETICROUTER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${provider.model}",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
  };
}
