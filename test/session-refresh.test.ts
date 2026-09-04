import { afterEach, describe, expect, it } from 'vitest';
import { readCapabilities, Sub2ApiClient } from '@kineticrouter/sub2api-client';
import { createApp } from '../apps/bff/src/app';
import { config } from '../apps/bff/src/config';
import { createSession, type SessionStore } from '../apps/bff/src/session-store';

const stores: SessionStore[] = [];

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
});

describe('session refresh failures', () => {
  it('keeps the session after a transient account-service outage', async () => {
    const { app, store, session } = await setupWithRefreshStatus(503);
    const response = await app.request('/portal/v1/me', { headers: sessionHeaders(session.id) });

    expect(response.status).toBe(503);
    expect(await store.get(session.id)).not.toBeNull();
  });

  it('removes the session after the refresh token is definitively rejected', async () => {
    const { app, store, session } = await setupWithRefreshStatus(401);
    const response = await app.request('/portal/v1/me', { headers: sessionHeaders(session.id) });

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toContain(`${config.sessionCookieName}=`);
    expect(await store.get(session.id)).toBeNull();
  });

  it.each([400, 403])('normalizes a definitive %i refresh rejection to an expired session', async (status) => {
    const { app, store, session } = await setupWithRefreshStatus(status);
    const response = await app.request('/portal/v1/me', { headers: sessionHeaders(session.id) });
    const body = await response.json() as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('SESSION_EXPIRED');
    expect(response.headers.get('set-cookie')).toContain(`${config.sessionCookieName}=`);
    expect(await store.get(session.id)).toBeNull();
  });
});

async function setupWithRefreshStatus(status: number) {
  const client = new Sub2ApiClient('https://account.invalid/api/v1', async () => new Response(JSON.stringify({
    code: [400, 401, 403].includes(status) ? 'TOKEN_REJECTED' : 'SERVICE_UNAVAILABLE',
    message: [400, 401, 403].includes(status) ? 'Refresh token rejected.' : 'Temporary outage.',
  }), { status, headers: { 'content-type': 'application/json' } }));
  const isolated = createApp(undefined, { client });
  stores.push(isolated.store);
  const session = createSession({
    capabilities: readCapabilities({}, { keys: false, profile: false, redeem: false }),
    user: {
      id: '42', username: 'Account owner', email: 'owner@example.com', avatarUrl: null,
      role: 'user', status: 'active', balance: '8.50', concurrency: 2,
    },
    tokens: { accessToken: 'expired-access', refreshToken: 'refresh', expiresAt: Date.now() - 1 },
  });
  await isolated.store.set(session);
  return { ...isolated, session };
}

function sessionHeaders(id: string) {
  return { cookie: `${config.sessionCookieName}=${id}` };
}
