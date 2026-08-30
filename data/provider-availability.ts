import rawAvailability from './provider-availability.json';

export type ProviderId = 'openai' | 'anthropic' | 'grok';
export type ProviderDisplayState = 'verified' | 'partial' | 'planned' | 'reference';
export type ProviderInteractionMode = 'live' | 'validation' | 'reference-only';

export type ProviderDisplayStatus = {
  label: string;
  aliases: string[];
  catalogState: ProviderDisplayState;
  modelAccessState: ProviderDisplayState;
  apiState: ProviderDisplayState;
  interactionMode: ProviderInteractionMode;
  badgeLabel: string;
  protocolLabel: string;
  baseUrl?: string;
  previewBaseUrl?: string;
  summary: string;
  evidenceNote: string;
  protocolSources: string[];
};

type ProviderAvailabilityConfig = {
  version: number;
  checkedAt: string;
  displayOnly: true;
  providers: Record<ProviderId, ProviderDisplayStatus>;
};

export const providerAvailabilityConfig = rawAvailability as ProviderAvailabilityConfig;
export const providerAvailability = providerAvailabilityConfig.providers;
export const providerAvailabilityCheckedAt = providerAvailabilityConfig.checkedAt;

export function resolveProviderId(value: string): ProviderId | undefined {
  const normalize = (candidate: string) => candidate.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const normalized = normalize(value);
  return (Object.entries(providerAvailability) as Array<[ProviderId, ProviderDisplayStatus]>)
    .find(([id, status]) => id === normalized || status.aliases.some((alias) => normalize(alias) === normalized))?.[0];
}

export function providerDisplayStatus(value: string): ProviderDisplayStatus {
  const id = resolveProviderId(value);
  if (!id) throw new Error(`Unknown provider display status: ${value}`);
  return providerAvailability[id];
}

export function providerAllowsInteraction(value: string) {
  return providerDisplayStatus(value).interactionMode !== 'reference-only';
}

export function displayStateLabel(state: ProviderDisplayState) {
  return ({ verified: 'Verified', partial: 'Partial', planned: 'Planned', reference: 'Reference' } as const)[state];
}
