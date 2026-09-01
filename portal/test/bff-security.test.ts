import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../apps/bff/src/app';
import { config } from '../apps/bff/src/config';

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
    expect((await response.json() as { data: unknown }).data).toEqual({ authenticated: false });

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
