import { describe, expect, it } from 'vitest';
import {
  getProviderDisplayEndpoint,
  getProviderDisplayStatus,
  isProviderIntegrationCopyable,
  providerDisplayIds,
  providerDisplayRegistry,
  resolveProviderDisplayId,
} from '../apps/console/src/lib/provider-display-status';

describe('provider display-status registry', () => {
  it('locks the generated registry metadata and provider order', () => {
    expect(providerDisplayRegistry.version).toBe(1);
    expect(providerDisplayRegistry.checkedAt).toBe('2026-09-03');
    expect(providerDisplayRegistry.displayOnly).toBe(true);
    expect(providerDisplayIds).toEqual(['openai', 'anthropic', 'grok']);
  });

  it('keeps OpenAI available and copyable through its base URL', () => {
    const provider = getProviderDisplayStatus('openai');
    expect(provider).toMatchObject({
      id: 'openai',
      catalogState: 'reference',
      modelAccessState: 'verified',
      apiState: 'verified',
      interactionMode: 'live',
      badgeLabel: 'Available',
      protocolLabel: 'OpenAI-compatible',
      baseUrl: 'https://api.kineticrouter.com/v1',
    });
    expect(provider.previewBaseUrl).toBeUndefined();
    expect(getProviderDisplayEndpoint(provider)).toBe(provider.baseUrl);
    expect(isProviderIntegrationCopyable(provider)).toBe(true);
  });

  it.each([
    ['anthropic', 'https://api.kineticrouter.com/anthropic', 'Anthropic native'],
    ['grok', 'https://api.kineticrouter.com/grok/v1', 'xAI-compatible'],
  ] as const)('keeps %s reference-only behind a preview URL', (id, endpoint, protocolLabel) => {
    const provider = getProviderDisplayStatus(id);
    expect(provider).toMatchObject({
      id,
      catalogState: 'reference',
      apiState: 'planned',
      interactionMode: 'reference-only',
      badgeLabel: 'Planned',
      protocolLabel,
      previewBaseUrl: endpoint,
      modelAccessState: 'reference',
    });
    expect(provider.baseUrl).toBeUndefined();
    expect(getProviderDisplayEndpoint(provider)).toBe(endpoint);
    expect(isProviderIntegrationCopyable(provider)).toBe(false);
  });

  it('resolves aliases without inventing unknown providers', () => {
    expect(resolveProviderDisplayId('GPT')).toBe('openai');
    expect(resolveProviderDisplayId('Codex')).toBe('openai');
    expect(resolveProviderDisplayId('Claude')).toBe('anthropic');
    expect(resolveProviderDisplayId('xAI')).toBe('grok');
    expect(resolveProviderDisplayId('x.ai')).toBe('grok');
    expect(resolveProviderDisplayId('x-ai')).toBe('grok');
    expect(resolveProviderDisplayId('unknown')).toBeUndefined();
    expect(() => getProviderDisplayStatus('unknown')).toThrow('Unknown provider display status');
  });
});
