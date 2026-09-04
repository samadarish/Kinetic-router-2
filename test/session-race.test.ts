import { afterEach, describe, expect, it } from 'vitest';
import { readCapabilities, Sub2ApiClient } from '@kineticrouter/sub2api-client';
import { createApp } from '../apps/bff/src/app';
import { config } from '../apps/bff/src/config';
import { createSession, type SessionStore } from '../apps/bff/src/session-store';

const stores: SessionStore[] = [];

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
});

describe('session concurrency', () => {
  it('prevents logout during refresh from resurrecting a session or leaving fresh tokens active', async () => {
    const refreshStarted = deferred<void>();
    const releaseRefresh = deferred<void>();
    const revokedTokens: string[] = [];
    const client = new Sub2ApiClient('https://account.invalid/api/v1', async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/auth/refresh')) {
        refreshStarted.resolve();
        await releaseRefresh.promise;
        return jsonResponse({ code: 0, data: { access_token: 'fresh-access', refresh_token: 'fresh-refresh', expires_in: 900 } });
      }
      if (url.pathname.endsWith('/auth/logout')) {
        revokedTokens.push(String(JSON.parse(String(init?.body)).refresh_token));
        return jsonResponse({ code: 0, data: {} });
      }
      if (url.pathname.endsWith('/user/profile')) {
        return jsonResponse({ code: 0, data: userRecord() });
      }
      return jsonResponse({ code: 0, data: {} });
    });
    const isolated = createApp(undefined, { client });
    stores.push(isolated.store);
    const session = createSession({
      capabilities: readCapabilities({}, { keys: false, profile: false, redeem: false }),
      user: {
        id: '42', username: 'Account owner', email: 'owner@example.com', avatarUrl: null,
        role: 'user', status: 'active', balance: '8.50', concurrency: 2,
      },
      tokens: { accessToken: 'expired-access', refreshToken: 'old-refresh', expiresAt: Date.now() - 1 },
    });
    await isolated.store.set(session);

    const profileRequest = isolated.app.request('/portal/v1/me', {
      headers: { cookie: `${config.sessionCookieName}=${session.id}` },
    });
    await refreshStarted.promise;

    const logoutResponse = await isolated.app.request('/portal/v1/auth/logout', {
      method: 'POST',
      headers: { origin: config.portalOrigin, cookie: `${config.sessionCookieName}=${session.id}` },
    });
    expect(logoutResponse.status).toBe(200);
    expect(await isolated.store.get(session.id)).toBeNull();

    releaseRefresh.resolve();
    expect((await profileRequest).status).toBe(401);
    await waitFor(async () => revokedTokens.includes('old-refresh') && revokedTokens.includes('fresh-refresh'));
    expect(await isolated.store.get(session.id)).toBeNull();
    expect(revokedTokens).toEqual(expect.arrayContaining(['old-refresh', 'fresh-refresh']));
  });

  it('does not let a slow profile read overwrite a newer profile write', async () => {
    const readStarted = deferred<void>();
    const releaseRead = deferred<void>();
    const client = new Sub2ApiClient('https://account.invalid/api/v1', async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/user/profile')) {
        readStarted.resolve();
        await releaseRead.promise;
        return jsonResponse({ code: 0, data: userRecord('Old name') });
      }
      if (url.pathname.endsWith('/user') && init?.method === 'PUT') {
        return jsonResponse({ code: 0, data: userRecord('New name') });
      }
      return jsonResponse({ code: 0, data: {} });
    });
    const isolated = createApp(undefined, { client, writeGates: { profile: true } });
    stores.push(isolated.store);
    const session = createSession({
      capabilities: readCapabilities({}, { keys: false, profile: true, redeem: false }),
      user: {
        id: '42', username: 'Original name', email: 'owner@example.com', avatarUrl: null,
        role: 'user', status: 'active', balance: '8.50', concurrency: 2,
      },
      tokens: { accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 60_000 },
    });
    await isolated.store.set(session);

    const slowRead = isolated.app.request('/portal/v1/me', {
      headers: { cookie: `${config.sessionCookieName}=${session.id}` },
    });
    await readStarted.promise;
    const writeResponse = await isolated.app.request('/portal/v1/me', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: `${config.sessionCookieName}=${session.id}`,
        origin: config.portalOrigin,
        'x-csrf-token': session.csrfToken,
      },
      body: JSON.stringify({ username: 'New name' }),
    });
    expect(writeResponse.status).toBe(200);
    expect((await isolated.store.get(session.id))?.user.username).toBe('New name');

    releaseRead.resolve();
    expect((await slowRead).status).toBe(200);
    await Promise.resolve();
    await Promise.resolve();
    expect((await isolated.store.get(session.id))?.user.username).toBe('New name');
  });
});

function userRecord(username = 'Account owner') {
  return {
    id: 42,
    username,
    email: 'owner@example.com',
    role: 'user',
    status: 'active',
    balance: '8.50',
    concurrency: 2,
  };
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

async function waitFor(predicate: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Timed out waiting for logout cleanup.');
}
