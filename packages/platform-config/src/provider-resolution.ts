import type { ProviderDisplayId } from './providers.js';

export type ModelProviderId = ProviderDisplayId | 'unknown';

const providers: ReadonlyArray<readonly [ProviderDisplayId, RegExp]> = [
  ['deepseek', /^deepseek(?:[\s/_.:-]|$)/],
  ['zhipu', /^(?:zhipu|glm|z[\s._-]*ai)(?:[\s/_.:-]|$)/],
  ['moonshot', /^(?:moonshot(?:ai)?|kimi)(?:[\s/_.:-]|$)/],
  ['meta', /^(?:meta(?:[\s._-]*llama)?|llama)(?:[\s/_.:-]|$)/],
  ['openai', /^(?:openai|azure[\s._-]*openai)(?:[\s/_.:-]|$)/],
  ['anthropic', /^(?:anthropic|claude)(?:[\s/_.:-]|$)/],
  ['grok', /^(?:grok|x[\s._-]*ai)(?:[\s/_.:-]|$)/],
  ['gemini', /^(?:gemini|google)(?:[\s/_.:-]|$)/],
  ['minimax', /^minimax(?:[\s/_.:-]|$)/],
];

function normalize(value?: string | null) {
  return value?.normalize('NFKC').trim().toLowerCase().replace(/^@/, '') ?? '';
}

function company(value?: string | null): ModelProviderId {
  const normalized = normalize(value);
  return providers.find(([, pattern]) => pattern.test(normalized))?.[0] ?? 'unknown';
}

/** Company names win over protocol: Moonshot can use an OpenAI-compatible API. */
export function resolveGroupProvider(group: { name: string; platform?: string | null }): ModelProviderId {
  const named = company(group.name);
  return named !== 'unknown' ? named : company(group.platform);
}

export function resolveModelProvider(modelId: string): ModelProviderId {
  const normalized = normalize(modelId).replace(/^models?[/.:_-]+/, '');
  const named = company(normalized);
  if (named !== 'unknown') return named;
  return /^(?:gpt|chatgpt|codex|o[1-9]|dall[\s._-]*e|text[\s._-]*embedding|whisper|tts|sora)(?:[\s/_.:-]|$)/.test(normalized) ? 'openai' : 'unknown';
}
