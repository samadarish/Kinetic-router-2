import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../apps/bff/src/app';
import { config } from '../apps/bff/src/config';
import { createSession, type SessionStore } from '../apps/bff/src/session-store';
import { readCapabilities, Sub2ApiClient } from '@kineticrouter/sub2api-client';

const { app, store } = createApp();

afterAll(async () => { await store.close(); });

describe('portal BFF security boundary', () => {
  it('keeps process liveness separate from dependency readiness', async () => {
    const response = await app.request('/healthz');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('rejects state-changing authentication requests without the exact Origin', async () => {
    const response = await app.request('/portal/v1/auth/password/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'person@example.com', password: 'not-a-real-password' }),
    });
    const payload = await response.json() as { error: { code: string } };
    expect(response.status).toBe(403);
    expect(payload.error.code).toBe('ORIGIN_INVALID');
  });

  it('rejects protected account reads without a server-side session', async () => {
    const response = await app.request('/portal/v1/me');
    const payload = await response.json() as { error: { code: string } };
    expect(response.status).toBe(401);
    expect(payload.error.code).toBe('AUTH_REQUIRED');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('exposes a minimal credentialed public session only to allowlisted origins', async () => {
    const origin = config.publicSiteOrigins[0]!;
    const response = await app.request('/portal/v1/public-session', { headers: { origin } });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    expect((await response.json() as { data: unknown }).data).toEqual({ authenticated: false, playgroundEnabled: true });

    const denied = await app.request('/portal/v1/public-session', {
      headers: { origin: 'https://attacker.example' },
    });
    expect(denied.status).toBe(403);
  });

  it.each(config.publicSiteOrigins)('allows a credentialed logout preflight from %s', async (origin) => {
    const response = await app.request('/portal/v1/auth/logout', {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'Accept, Content-Type',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    expect(response.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect(response.headers.get('access-control-allow-headers')).toBe('Accept, Content-Type');
    expect(response.headers.get('access-control-max-age')).toBe('600');
    expect(response.headers.get('vary')).toContain('Origin');
  });

  it.each(config.publicSiteOrigins)('allows logout from the public site origin %s', async (origin) => {
    const response = await app.request('/portal/v1/auth/logout', {
      method: 'POST',
      headers: { accept: 'application/json', origin },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { loggedOut: true } });
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    expect(response.headers.get('vary')).toContain('Origin');
    expect(response.headers.get('set-cookie')).toContain(`${config.sessionCookieName}=`);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('does not retain a revocation marker for an unknown session id', async () => {
    const session = createSession({
      capabilities: readCapabilities({}, { keys: false, profile: false, redeem: false }),
      user: {
        id: 'new', username: 'New session', email: 'new@example.com', avatarUrl: null,
        role: 'user', status: 'active', balance: '0.00', concurrency: 1,
      },
      tokens: { accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 60_000 },
    });
    const response = await app.request('/portal/v1/auth/logout', {
      method: 'POST',
      headers: { origin: config.portalOrigin, cookie: `${config.sessionCookieName}=${session.id}` },
    });

    expect(response.status).toBe(200);
    await store.set(session);
    expect(await store.get(session.id)).not.toBeNull();
    await store.delete(session.id);
  });

  it('loads an existing session without depending on public settings', async () => {
    const client = new Sub2ApiClient('https://account.invalid/api/v1', async () => {
      throw new TypeError('account service offline');
    });
    const isolated = createApp(undefined, { client, writeGates: { keys: true, profile: true, redeem: true } });
    const capabilities = readCapabilities({}, { keys: true, profile: true, redeem: true });
    const session = createSession({
      capabilities,
      user: {
        id: '42',
        username: 'Account owner',
        email: 'owner@example.com',
        avatarUrl: null,
        role: 'user',
        status: 'active',
        balance: '8.50',
        concurrency: 2,
      },
      tokens: { accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 60_000 },
    });
    await isolated.store.set(session);

    try {
      const response = await isolated.app.request('/portal/v1/auth/session', {
        headers: { cookie: `${config.sessionCookieName}=${session.id}` },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true,
        data: { authenticated: true, user: { id: '42' }, capabilities },
      });
    } finally {
      await isolated.store.close();
    }
  });

  it('preserves the browser cookie for a safe retry when the session store is unavailable during logout', async () => {
    const failingStore: SessionStore = {
      get: async () => { throw new Error('store unavailable'); },
      set: async () => {},
      delete: async () => {},
      revoke: async () => { throw new Error('store unavailable'); },
      withLock: async <T>(_id: string, callback: () => Promise<T>) => callback(),
      ping: async () => {},
      hitRateLimit: async () => false,
      close: async () => {},
    };
    const isolated = createApp(failingStore);
    const response = await isolated.app.request('/portal/v1/auth/logout', {
      method: 'POST',
      headers: {
        origin: config.portalOrigin,
        cookie: `${config.sessionCookieName}=stale-session`,
      },
    });

    expect(response.status).toBe(503);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it.each([undefined, 'https://attacker.example'])('rejects logout preflight from denied origin %s', async (origin) => {
    const headers: Record<string, string> = {
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'Content-Type',
    };
    if (origin) headers.origin = origin;

    const response = await app.request('/portal/v1/auth/logout', { method: 'OPTIONS', headers });
    const payload = await response.json() as { error: { code: string } };

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe('ORIGIN_INVALID');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it.each([undefined, 'https://attacker.example'])('rejects logout from denied origin %s', async (origin) => {
    const headers: Record<string, string> = {};
    if (origin) headers.origin = origin;

    const response = await app.request('/portal/v1/auth/logout', { method: 'POST', headers });
    const payload = await response.json() as { error: { code: string } };

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe('ORIGIN_INVALID');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
  });

});
