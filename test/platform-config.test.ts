import { describe, expect, it } from 'vitest';
import { consoleHref, normalizeAppOrigin, resolveConsoleOrigin, resolvePublicSiteOrigin } from '@kineticrouter/platform-config/origins';
import { resolveConsoleReturnPath } from '@kineticrouter/platform-config/routes';
import { getProviderDisplayStatus, resolveProviderDisplayId } from '@kineticrouter/platform-config/providers';

describe('shared product configuration', () => {
  it('maps local origins without accepting insecure remote origins', () => {
    expect(resolveConsoleOrigin({ runtimeOrigin: 'http://localhost:3000' })).toBe('http://localhost:5174');
    expect(resolvePublicSiteOrigin({ runtimeOrigin: 'http://127.0.0.1:5174' })).toBe('http://127.0.0.1:3000');
    expect(normalizeAppOrigin('http://malicious.example')).toBeUndefined();
    expect(consoleHref('//malicious.example')).toBe('https://console.kineticrouter.com/');
  });

  it('allows only canonical console return paths and maps legacy links', () => {
    expect(resolveConsoleReturnPath('/console/overview')).toBe('/dashboard');
    expect(resolveConsoleReturnPath('/console/api-keys?tab=active')).toBe('/api-keys?tab=active');
    expect(resolveConsoleReturnPath('/usage?page=2')).toBe('/usage?page=2');
    expect(resolveConsoleReturnPath('//malicious.example')).toBe('/dashboard');
    expect(resolveConsoleReturnPath('https://malicious.example')).toBe('/dashboard');
    expect(resolveConsoleReturnPath('/unknown')).toBe('/dashboard');
  });

  it('uses one canonical provider registry', () => {
    expect(resolveProviderDisplayId('codex')).toBe('openai');
    expect(resolveProviderDisplayId('claude')).toBe('anthropic');
    expect(getProviderDisplayStatus('grok').interactionMode).toBe('reference-only');
  });
});
