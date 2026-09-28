import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sub2ApiClient, mapAuthTokens, readCapabilities } from '@kineticrouter/sub2api-client';
import { createApp } from '../apps/bff/src/app';
import { config } from '../apps/bff/src/config';
import { createSession } from '../apps/bff/src/session-store';

vi.mock('@hono/node-server/conninfo', () => ({ getConnInfo: () => ({ remote: { address: '127.0.0.1' } }) }));

const user = { id: 42, username: 'Owner', email: 'owner@example.test', role: 'user', status: 'active' };
const tokens = { access_token: 'access', refresh_token: 'refresh', expires_in: 900 };
const resources: ReturnType<typeof createApp>[] = [];
afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.supportRealtime.close();
    await Promise.all([resource.store.close(), resource.authFlows.close(), resource.analytics.close(), resource.playgroundSettings.close(), resource.websiteSettings.close(), resource.conversations.close(), resource.supportStore.close()]);
  }
});
const json = (data: unknown) => Response.json({ code: 0, data });

describe('upstream authentication response validation', () => {
  it('bounds ordinary account replies, rejects interrupted writes, and preserves no-content writes', async () => {
    const oversized = new Sub2ApiClient('https://account.invalid', async () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': String(16 * 1024 * 1024 + 1) } }));
    await expect(oversized.request('user/profile')).rejects.toMatchObject({ code: 'UPSTREAM_RESPONSE_TOO_LARGE' });
    const interrupted = new Sub2ApiClient('https://account.invalid', async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error('connection reset')); } }), { headers: { 'content-type': 'application/json' } }));
    await expect(interrupted.request('keys/1', { method: 'DELETE' })).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    const empty = new Sub2ApiClient('https://account.invalid', async () => new Response(null, { status: 204 }));
    await expect(empty.request('keys/1', { method: 'DELETE' })).resolves.toBeNull();
    const invalid = new Sub2ApiClient('https://account.invalid', async () => new Response('{', { headers: { 'content-type': 'application/json' } }));
    await expect(invalid.request('keys/1', { method: 'DELETE' })).rejects.toMatchObject({ code: 'UPSTREAM_INVALID_RESPONSE' });
    const rejected = new Sub2ApiClient('https://account.invalid', async () => Response.json({ code: 1, message: 'Rejected' }));
    await expect(rejected.request('keys/1', { method: 'DELETE' })).rejects.toMatchObject({ status: 400 });
  });
  const invalid = [
    {}, { ...tokens, user: {} }, { ...tokens, user: { ...user, id: '' } },
    { ...tokens, user: { ...user, email: '' } }, { ...tokens, user, access_token: '' },
    { ...tokens, user, refresh_token: 123 }, { ...tokens, user, access_token: 'x'.repeat(16_385) },
    { ...tokens, user, expires_in: 0 }, { ...tokens, user, expires_in: 'Infinity' },
    { ...tokens, user, token_type: 'Basic' },
  ];
  it.each(invalid)('rejects incomplete password and TOTP identities %#', async data => {
    const client = new Sub2ApiClient('https://account.invalid', async () => json(data));
    await expect(client.login({ email: user.email, password: 'password' })).rejects.toMatchObject({ status: 502, code: 'INVALID_AUTH_RESPONSE' });
    await expect(client.login2fa({ tempToken: 'challenge', code: '123456' })).rejects.toMatchObject({ status: 502, code: 'INVALID_AUTH_RESPONSE' });
  });
  it.each(['', 'x'.repeat(4097)])('rejects unusable second-factor challenges %#', async temp_token => {
    const client = new Sub2ApiClient('https://account.invalid', async () => json({ requires_2fa: true, temp_token }));
    await expect(client.login({ email: user.email, password: 'password' })).rejects.toMatchObject({ code: 'INVALID_AUTH_RESPONSE' });
  });
  it('rejects inactive identities and invalid refreshed credentials', async () => {
    const client = new Sub2ApiClient('https://account.invalid', async () => json({ ...tokens, user: { ...user, status: 'disabled' } }));
    await expect(client.login({ email: user.email, password: 'password' })).rejects.toMatchObject({ status: 403 });
    const broken = new Sub2ApiClient('https://account.invalid', async () => json({}));
    await expect(broken.refresh('refresh')).rejects.toMatchObject({ code: 'INVALID_AUTH_RESPONSE' });
    const now = Date.now();
    expect(mapAuthTokens({ ...tokens, expires_in: '5' }).expiresAt).toBeLessThanOrEqual(now + 5100);
  });
  it.each(['html', 'malformed', 'empty'])('does not create a local session for a %s login reply', async kind => {
    const client = new Sub2ApiClient('https://account.invalid', async input => String(input).includes('settings/public') ? json({})
      : kind === 'html' ? new Response('<html>Maintenance</html>')
        : kind === 'malformed' ? new Response('{', { headers: { 'content-type': 'application/json' } }) : json({}));
    const resource = createApp(undefined, { client, analyticsEnabled: false }); resources.push(resource);
    const response = await resource.app.request('/portal/v1/auth/password/login', {
      method: 'POST', headers: { origin: config.portalOrigin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'password' }),
    });
    expect(response.status).toBe(502);
    expect(response.headers.get('set-cookie')).toBeNull();
  });
  it.each([{}, { ...user, id: 99 }])('never replaces session ownership with an invalid profile %#', async profile => {
    const client = new Sub2ApiClient('https://account.invalid', async () => json(profile));
    const resource = createApp(undefined, { client, analyticsEnabled: false, writeGates: { profile: true } }); resources.push(resource);
    const session = createSession({ user: { ...user, id: '42', avatarUrl: null, balance: '0', concurrency: 1 }, tokens: mapAuthTokens(tokens), capabilities: readCapabilities({}, { keys: false, profile: true, redeem: false }) });
    await resource.store.set(session);
    for (const [method, path] of [['GET', '/me'], ['GET', '/dashboard'], ['PATCH', '/me']]) {
      const response = await resource.app.request(`/portal/v1${path}`, {
        method, headers: { cookie: `${config.sessionCookieName}=${session.id}`, origin: config.portalOrigin, 'x-csrf-token': session.csrfToken, 'content-type': 'application/json' },
        ...(method === 'PATCH' ? { body: JSON.stringify({ username: 'Updated' }) } : {}),
      });
      expect(response.status).toBe(502);
      expect((await resource.store.get(session.id))?.user.id).toBe('42');
    }
  });
});
