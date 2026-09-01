import rawRegistry from './provider-display-status.generated.json';

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

const registry = rawRegistry as unknown as ProviderDisplayRegistry;
assertRegistry(registry);

export const providerDisplayRegistry = registry;
export const providerDisplayStatuses = providerDisplayIds.map((id) => ({
  id,
  ...registry.providers[id],
}));

export function resolveProviderDisplayId(value: string): ProviderDisplayId | undefined {
  const normalized = normalizeProviderAlias(value);
  return providerDisplayIds.find((id) => id === normalized
    || registry.providers[id].aliases.some((alias) => normalizeProviderAlias(alias) === normalized));
}

export function getProviderDisplayStatus(value: string): ProviderDisplayStatus & { readonly id: ProviderDisplayId } {
  const id = resolveProviderDisplayId(value);
  if (!id) throw new Error(`Unknown provider display status: ${value}`);
  return { id, ...registry.providers[id] };
}

export function getProviderDisplayEndpoint(value: string | ProviderDisplayStatus): string {
  const status = typeof value === 'string' ? getProviderDisplayStatus(value) : value;
  const endpoint = status.baseUrl ?? status.previewBaseUrl;
  if (!endpoint) throw new Error(`Provider display status for ${status.label} has no endpoint.`);
  return endpoint;
}

export function isProviderIntegrationCopyable(value: string | ProviderDisplayStatus): boolean {
  const status = typeof value === 'string' ? getProviderDisplayStatus(value) : value;
  return status.interactionMode === 'validation' && Boolean(status.baseUrl);
}

function normalizeProviderAlias(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function assertRegistry(value: ProviderDisplayRegistry) {
  if (value.version !== 1 || value.displayOnly !== true || !/^\d{4}-\d{2}-\d{2}$/.test(value.checkedAt) || !value.providers) {
    throw new Error('Unsupported provider display-status registry metadata.');
  }

  const aliases = new Map<string, ProviderDisplayId>();
  const providerKeys = Object.keys(value.providers).sort();
  if (providerKeys.join(',') !== [...providerDisplayIds].sort().join(',')) {
    throw new Error('Provider display status registry has unexpected provider IDs.');
  }
  for (const id of providerDisplayIds) {
    const provider = value.providers[id];
    if (!provider || provider.catalogState !== 'reference') {
      throw new Error(`Provider display status is missing or invalid: ${id}`);
    }
    if (!['verified', 'partial', 'planned', 'reference'].includes(provider.modelAccessState)
      || !['verified', 'partial', 'planned', 'reference'].includes(provider.apiState)
      || !['live', 'validation', 'reference-only'].includes(provider.interactionMode)
      || !provider.label || !provider.badgeLabel || !provider.protocolLabel
      || !provider.summary || !provider.evidenceNote || !Array.isArray(provider.aliases)
      || !Array.isArray(provider.protocolSources) || provider.protocolSources.length === 0) {
      throw new Error(`Provider display status has an invalid schema: ${id}`);
    }
    if (provider.interactionMode === 'validation' && (!provider.baseUrl || provider.previewBaseUrl)) {
      throw new Error(`Validation provider must expose only a base URL: ${id}`);
    }
    if (provider.interactionMode === 'validation' && provider.apiState !== 'partial') {
      throw new Error(`Validation provider must be partially verified: ${id}`);
    }
    if (provider.interactionMode === 'reference-only' && (!provider.previewBaseUrl || provider.baseUrl)) {
      throw new Error(`Reference-only provider must expose only a preview base URL: ${id}`);
    }
    if (provider.interactionMode === 'reference-only' && provider.apiState !== 'planned') {
      throw new Error(`Reference-only provider must be planned: ${id}`);
    }
    for (const alias of [id, ...provider.aliases]) {
      const normalized = normalizeProviderAlias(alias);
      const owner = aliases.get(normalized);
      if (owner && owner !== id) throw new Error(`Duplicate provider display alias: ${alias}`);
      aliases.set(normalized, id);
    }
  }
}
