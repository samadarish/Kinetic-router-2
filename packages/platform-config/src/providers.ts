import rawRegistry from './provider-registry.json' with { type: 'json' };

export const providerDisplayIds = ['openai', 'anthropic', 'grok'] as const;
export type ProviderDisplayId = typeof providerDisplayIds[number];
export type ProviderDisplayState = 'verified' | 'partial' | 'planned' | 'reference';
export type ProviderInteractionMode = 'live' | 'validation' | 'reference-only';
export type ProviderDisplayStatus = {
  readonly label: string;
  readonly aliases: readonly string[];
  readonly catalogState: ProviderDisplayState;
  readonly modelAccessState: ProviderDisplayState;
  readonly apiState: ProviderDisplayState;
  readonly interactionMode: ProviderInteractionMode;
  readonly badgeLabel: string;
  readonly protocolLabel: string;
  readonly baseUrl?: string;
  readonly previewBaseUrl?: string;
  readonly summary: string;
  readonly evidenceNote: string;
  readonly protocolSources: readonly string[];
};
export type ProviderDisplayRegistry = {
  readonly version: 1;
  readonly checkedAt: string;
  readonly displayOnly: true;
  readonly providers: Readonly<Record<ProviderDisplayId, ProviderDisplayStatus>>;
};

assertProviderDisplayRegistry(rawRegistry);
export const providerDisplayRegistry = rawRegistry;
export const providerDisplayStatuses = providerDisplayIds.map((id) => ({ id, ...providerDisplayRegistry.providers[id] }));

export function assertProviderDisplayRegistry(value: unknown): asserts value is ProviderDisplayRegistry {
  if (!value || typeof value !== 'object') throw new Error('Provider display registry is missing.');
  const candidate = value as ProviderDisplayRegistry;
  if (candidate.version !== 1 || candidate.displayOnly !== true || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.checkedAt)) throw new Error('Unsupported provider display registry metadata.');
  const keys = Object.keys(candidate.providers ?? {}).sort();
  if (keys.join(',') !== [...providerDisplayIds].sort().join(',')) throw new Error('Provider display registry has unexpected provider IDs.');
  const aliases = new Map<string, ProviderDisplayId>();
  for (const id of providerDisplayIds) {
    const provider = candidate.providers[id];
    if (!provider || provider.catalogState !== 'reference' || !['verified', 'partial', 'planned', 'reference'].includes(provider.modelAccessState) || !['verified', 'partial', 'planned', 'reference'].includes(provider.apiState) || !['live', 'validation', 'reference-only'].includes(provider.interactionMode) || !provider.label || !provider.badgeLabel || !provider.protocolLabel || !provider.summary || !provider.evidenceNote || !Array.isArray(provider.aliases) || !Array.isArray(provider.protocolSources) || provider.protocolSources.length === 0) throw new Error(`Provider display status is invalid: ${id}`);
    if (provider.interactionMode === 'live' && (!provider.baseUrl || provider.previewBaseUrl || provider.apiState !== 'verified')) throw new Error(`Live provider is invalid: ${id}`);
    if (provider.interactionMode === 'validation' && (!provider.baseUrl || provider.previewBaseUrl || provider.apiState !== 'partial')) throw new Error(`Validation provider is invalid: ${id}`);
    if (provider.interactionMode === 'reference-only' && (!provider.previewBaseUrl || provider.baseUrl || provider.apiState !== 'planned')) throw new Error(`Reference-only provider is invalid: ${id}`);
    for (const alias of [id, ...provider.aliases]) {
      const normalized = normalizeAlias(alias);
      const owner = aliases.get(normalized);
      if (owner && owner !== id) throw new Error(`Duplicate provider alias: ${alias}`);
      aliases.set(normalized, id);
    }
  }
}

export function resolveProviderDisplayId(value: string) {
  const normalized = normalizeAlias(value);
  return providerDisplayIds.find((id) => id === normalized || providerDisplayRegistry.providers[id].aliases.some((alias) => normalizeAlias(alias) === normalized));
}

export function getProviderDisplayStatus(value: string) {
  const id = resolveProviderDisplayId(value);
  if (!id) throw new Error(`Unknown provider display status: ${value}`);
  return { id, ...providerDisplayRegistry.providers[id] };
}

export function getProviderDisplayEndpoint(value: string | ProviderDisplayStatus) {
  const status = typeof value === 'string' ? getProviderDisplayStatus(value) : value;
  const endpoint = status.baseUrl ?? status.previewBaseUrl;
  if (!endpoint) throw new Error(`Provider display status for ${status.label} has no endpoint.`);
  return endpoint;
}

export function providerAllowsInteraction(value: string | ProviderDisplayStatus) {
  const status = typeof value === 'string' ? getProviderDisplayStatus(value) : value;
  return status.interactionMode !== 'reference-only' && Boolean(status.baseUrl);
}

export const isProviderIntegrationCopyable = providerAllowsInteraction;
export function displayStateLabel(state: ProviderDisplayState) {
  return ({ verified: 'Verified', partial: 'Partial', planned: 'Planned', reference: 'Reference' } as const)[state];
}
function normalizeAlias(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'); }
