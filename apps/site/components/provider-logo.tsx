import { ProviderIcon, resolveProviderIconKind } from '@kineticrouter/brand-ui';
import { providerDisplayStatus, resolveProviderId } from '@/data/provider-availability';

export type ProviderId = 'openai' | 'anthropic' | 'claude' | 'grok' | 'unknown';

export function resolveProvider(provider?: string, model?: string): ProviderId {
  return resolveProviderIconKind({ provider, model });
}

export function ProviderLogo({ provider, model, className = 'h-7 w-7', label }: { provider?: string; model?: string; className?: string; label?: string }) {
  return <ProviderIcon provider={provider} model={model} className={className} label={label} />;
}

export function providerLabel(provider: string) {
  if (provider === 'claude') return 'Claude';
  const id = resolveProviderId(provider);
  return id ? providerDisplayStatus(id).label : 'Unknown provider';
}
