import { afterEach, describe, expect, it } from 'vitest';
import { readCapabilities, Sub2ApiClient } from '@kineticrouter/sub2api-client';
import { createApp } from '../apps/bff/src/app';
import { config } from '../apps/bff/src/config';
import { createSession, type PortalSession, type SessionStore } from '../apps/bff/src/session-store';

const stores: SessionStore[] = [];

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
});

describe('redemption route', () => {
  it('preserves code casing, sanitizes display text, and refreshes cached account totals', async () => {
    let submittedBody = '';
    const client = new Sub2ApiClient('https://account.invalid/api/v1', async (_input, init) => {
      submittedBody = String(init?.body ?? '');
      return jsonResponse({
        code: 0,
        data: {
          message: 'Sub2API code redeemed.',
          type: 'balance',
          value: '5.00',
          group_name: 'Sub2API Standard',
          new_balance: '13.50',
          new_concurrency: 4,
        },
      });
    });
    const isolated = createApp(undefined, { client, writeGates: { redeem: true } });
    stores.push(isolated.store);
    const session = testSession();
    await isolated.store.set(session);

    const response = await isolated.app.request('/portal/v1/redemptions', {
      method: 'POST',
      headers: authenticatedHeaders(session),
      body: JSON.stringify({ code: 'MiXeD-Code-42' }),
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(submittedBody)).toEqual({ code: 'MiXeD-Code-42' });
    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        message: 'kineticRouter code redeemed.',
        groupName: 'kineticRouter Standard',
        newBalance: '13.50',
        newConcurrency: 4,
      },
    });
    expect((await isolated.store.get(session.id))?.user).toMatchObject({ balance: '13.50', concurrency: 4 });
  });

  it('does not report a consumed code as failed when the session cache update fails', async () => {
    const session = testSession();
    const store: SessionStore = {
      get: async () => structuredClone(session),
      set: async () => {},
      delete: async () => {},
      revoke: async () => null,
      withLock: async () => { throw new Error('cache unavailable'); },
      ping: async () => {},
      hitRateLimit: async () => false,
      close: async () => {},
    };
    const client = new Sub2ApiClient('https://account.invalid/api/v1', async () => jsonResponse({
      code: 0,
      data: { message: 'Code redeemed.', type: 'balance', value: '2.00', new_balance: '10.50' },
    }));
    const isolated = createApp(store, { client, writeGates: { redeem: true } });

    const response = await isolated.app.request('/portal/v1/redemptions', {
      method: 'POST',
      headers: authenticatedHeaders(session),
      body: JSON.stringify({ code: 'single-use-code' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { newBalance: '10.50' } });
  });
});

function testSession(): PortalSession {
  return createSession({
    capabilities: readCapabilities({}, { keys: false, profile: false, redeem: true }),
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
}

function authenticatedHeaders(session: PortalSession) {
  return {
    'content-type': 'application/json',
    cookie: `${config.sessionCookieName}=${session.id}`,
    origin: config.portalOrigin,
    'x-csrf-token': session.csrfToken,
  };
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
