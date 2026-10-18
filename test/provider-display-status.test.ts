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
  it('locks the canonical registry metadata and provider order', () => {
    expect(providerDisplayRegistry.version).toBe(1);
    expect(providerDisplayRegistry.checkedAt).toBe('2026-10-18');
    expect(providerDisplayRegistry.displayOnly).toBe(true);
    expect(providerDisplayIds).toEqual(['openai', 'anthropic', 'grok', 'deepseek', 'zhipu', 'moonshot', 'gemini', 'minimax', 'meta']);
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
    ['anthropic', 'https://api.kineticrouter.com/v1', 'OpenAI-compatible'],
    ['grok', 'https://api.kineticrouter.com/v1', 'OpenAI-compatible'],
  ] as const)('keeps %s available and copyable through its base URL', (id, endpoint, protocolLabel) => {
    const provider = getProviderDisplayStatus(id);
    expect(provider).toMatchObject({
      id,
      catalogState: 'reference',
      apiState: 'verified',
      interactionMode: 'live',
      badgeLabel: 'Available',
      protocolLabel,
      baseUrl: endpoint,
      modelAccessState: 'verified',
    });
    expect(provider.previewBaseUrl).toBeUndefined();
    expect(getProviderDisplayEndpoint(provider)).toBe(endpoint);
    expect(isProviderIntegrationCopyable(provider)).toBe(true);
  });

  it('keeps Meta planned and prevents copying', () => {
    const meta = getProviderDisplayStatus('meta');
    expect(meta).toMatchObject({ modelAccessState: 'planned', apiState: 'planned', badgeLabel: 'Planned', interactionMode: 'reference-only' });
    expect(meta.baseUrl).toBeUndefined();
    expect(isProviderIntegrationCopyable(meta)).toBe(false);
    expect(resolveProviderDisplayId('google')).toBe('gemini');
    expect(resolveProviderDisplayId('kimi')).toBe('moonshot');
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
