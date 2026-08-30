import { AnthropicIcon, ClaudeIcon, GrokIcon, OpenAIIcon, UnknownProviderIcon } from './icons';
import { providerDisplayStatus, resolveProviderId } from '@/data/provider-availability';

export type ProviderId = 'openai' | 'anthropic' | 'claude' | 'grok' | 'unknown';

export function resolveProvider(provider?: string, model?: string): ProviderId {
  const explicit = provider?.trim().toLowerCase();
  if (explicit && ['openai', 'anthropic', 'claude', 'grok'].includes(explicit)) return explicit as ProviderId;
  if (explicit && ['xai', 'x-ai'].includes(explicit)) return 'grok';
  const value = `${explicit ?? ''} ${model ?? ''}`.trim().toLowerCase();
  if (/^(?:anthropic\/|claude-)/.test(value) || /\s(?:anthropic\/|claude-)/.test(value)) return 'anthropic';
  if (/^(?:grok\/|grok-|xai\/|x-ai\/)/.test(value) || /\s(?:grok\/|grok-|xai\/|x-ai\/)/.test(value)) return 'grok';
  if (/^(?:openai\/|gpt-|chatgpt-|gpt-image-|o[134](?:-|$))/.test(value) || /\s(?:openai\/|gpt-|chatgpt-|gpt-image-|o[134](?:-|$))/.test(value)) return 'openai';
  return 'unknown';
}

export function ProviderLogo({ provider, model, className = 'h-7 w-7', label }: { provider?: string; model?: string; className?: string; label?: string }) {
  const id = resolveProvider(provider, model);
  const accessibility = label ? { role: 'img', 'aria-label': label, 'aria-hidden': undefined } : { 'aria-hidden': true as const };
  if (id === 'anthropic') return <AnthropicIcon className={`${className} text-[#D97757]`} {...accessibility} />;
  if (id === 'claude') return <ClaudeIcon className={`${className} text-[#D97757]`} {...accessibility} />;
  if (id === 'grok') return <GrokIcon className={className} {...accessibility} />;
  if (id === 'openai') return <OpenAIIcon className={className} {...accessibility} />;
  return <UnknownProviderIcon className={className} {...accessibility} />;
}

export function providerLabel(provider: string) {
  if (provider === 'claude') return 'Claude';
  const id = resolveProviderId(provider);
  if (id) return providerDisplayStatus(id).label;
  return 'Unknown provider';
}
