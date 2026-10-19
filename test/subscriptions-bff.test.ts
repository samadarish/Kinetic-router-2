import type { CapabilityMap } from '@kineticrouter/portal-contract';
import { readCapabilities, Sub2ApiClient } from '@kineticrouter/sub2api-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../apps/bff/src/app';
import { config } from '../apps/bff/src/config';
import { createSession, type SessionStore } from '../apps/bff/src/session-store';

const stores: SessionStore[] = [];
afterEach(async () => {
  await Promise.all(stores.splice(0).map(store => store.close()));
  vi.useRealTimers();
});

async function setup(subscriptionEnabled?: boolean) {
  const upstream = { subscriptionEnabled, unavailable: false };
  const fetcher = vi.fn<typeof fetch>(async input => {
    const path = new URL(String(input)).pathname.replace('/api/v1/', '');
    if (path === 'settings/public' && upstream.unavailable) return new Response('{}', { status: 503 });
    const data = path === 'settings/public'
      ? { subscription_enabled: upstream.subscriptionEnabled, purchase_subscription_enabled: true }
      : path === 'subscriptions' ? [{ id: 7, status: 'active', expires_at: '2026-12-31T00:00:00Z' }] : undefined;
    if (data === undefined) throw new Error(`Unexpected upstream request: ${path}`);
    return Response.json({ code: 0, data });
  });
  const instance = createApp(undefined, { client: new Sub2ApiClient('https://account.invalid/api/v1', fetcher), analyticsEnabled: false });
  stores.push(instance.store);
  const session = createSession({
    user: { id: '42', username: 'Customer', email: 'customer@example.test', role: 'user', status: 'active', avatarUrl: null, balance: '1', concurrency: 1 },
    capabilities: readCapabilities({}, { keys: false, profile: false, redeem: false }),
    tokens: { accessToken: 'fixture-access', refreshToken: 'fixture-refresh', expiresAt: Date.now() + 3_600_000 },
  });
  await instance.store.set(session);
  const get = (path: string) => instance.app.request(`/portal/v1${path}`, { headers: { cookie: `${config.sessionCookieName}=${session.id}` } });
  const subscriptionReads = () => fetcher.mock.calls.filter(([input]) => new URL(String(input)).pathname === '/api/v1/subscriptions');
  return { ...instance, session, upstream, get, subscriptionReads, fetcher };
}

describe('subscription visibility', () => {
  it.each([true, false, undefined])('propagates the setting (%s) and enforces it on authenticated reads', async enabled => {
    const { get, subscriptionReads } = await setup(enabled);
    const expected = { subscriptions: enabled !== false, subscriptionPurchase: enabled !== false };
    expect((await (await get('/config')).json()).data.capabilities).toMatchObject(expected);
    expect((await (await get('/capabilities')).json()).data).toMatchObject(expected);
    expect((await (await get('/auth/session')).json()).data.capabilities).toMatchObject(expected);

    const response = await get('/subscriptions');
    if (enabled === false) {
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ ok: false, error: { code: 'FEATURE_DISABLED' } });
      expect(subscriptionReads()).toHaveLength(0);
    } else {
      expect(response.status).toBe(200);
      expect((await response.json()).data).toMatchObject([{ id: '7', status: 'active' }]);
      expect(subscriptionReads()).toHaveLength(1);
    }
  });

  it('checks the current setting on a direct request even when the session says enabled', async () => {
    const { get, session, subscriptionReads } = await setup(false);
    expect(session.capabilities.subscriptions).toBe(true);
    expect((await get('/subscriptions')).status).toBe(403);
    expect(subscriptionReads()).toHaveLength(0);
  });

  it('refreshes visibility for an existing session after the settings cache expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { get, store, session, upstream, subscriptionReads } = await setup(true);
    await get('/config');
    upstream.subscriptionEnabled = false;
    vi.setSystemTime(Date.now() + 60_001);
    await get('/auth/session');
    await vi.waitFor(async () => expect((await store.get(session.id))?.capabilities.subscriptions).toBe(false));
    expect((await (await get('/auth/session')).json()).data).toMatchObject({ authenticated: true, capabilities: { subscriptions: false, subscriptionPurchase: false } });
    expect((await get('/subscriptions')).status).toBe(403);
    expect(subscriptionReads()).toHaveLength(0);

    upstream.subscriptionEnabled = true;
    vi.setSystemTime(Date.now() + 60_001);
    expect((await get('/subscriptions')).status).toBe(200);
    expect((await (await get('/auth/session')).json()).data.capabilities.subscriptions).toBe(true);
  });

  it('keeps older sessions working when they have no subscription capability', async () => {
    const { get, store, session } = await setup();
    delete (session.capabilities as Partial<CapabilityMap>).subscriptions;
    await store.set(session);
    const response = await get('/auth/session');
    expect((await response.json()).data).toMatchObject({ authenticated: true, capabilities: { subscriptions: true } });
    expect((await get('/subscriptions')).status).toBe(200);
  });

  it('preserves the last known disabled setting during an upstream settings outage', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { get, upstream, subscriptionReads } = await setup(false);
    await get('/config');
    upstream.unavailable = true;
    vi.setSystemTime(Date.now() + 60_001);
    expect((await get('/subscriptions')).status).toBe(403);
    expect(subscriptionReads()).toHaveLength(0);
  });

  it('does not fetch subscriptions if settings cannot be verified on a cold cache', async () => {
    const { get, upstream, subscriptionReads } = await setup();
    upstream.unavailable = true;
    expect((await get('/subscriptions')).status).toBe(503);
    expect(subscriptionReads()).toHaveLength(0);
  });

  it('continues to require authentication before reading settings or subscriptions', async () => {
    const { app, fetcher } = await setup(true);
    expect((await app.request('/portal/v1/subscriptions')).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
