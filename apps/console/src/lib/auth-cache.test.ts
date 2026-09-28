import { QueryClient, QueryObserver } from '@tanstack/react-query';
import type { CapabilityMap, SessionView } from '@kineticrouter/portal-contract';
import { describe, expect, it } from 'vitest';
import { applyLoggedOutQueryState, applyMetricsAuthorizationState, reconcileSessionQueries } from './auth-cache';

const capabilities: CapabilityMap = {
  registration: false,
  passwordReset: false,
  totp: false,
  passkeys: false,
  google: false,
  payments: false,
  subscriptionPurchase: false,
  modelPlaza: false,
  availableChannels: false,
  channelMonitor: true,
  channelMonitorMode: 'v1',
  affiliate: false,
  usageErrors: false,
  promoCode: true,
  keyWrites: false,
  profileWrites: false,
  redeemWrites: false,
  announcementWrites: false,
};

describe('logged-out query state', () => {
  it.each(['another-account', 'anonymous'])('clears cached and pending account data before a polled %s session', async destination => {
    const client = new QueryClient();
    const previous: SessionView = { authenticated: true, playgroundEnabled: true, capabilities, user: { id: '42', role: 'user', status: 'active', username: 'Owner', email: 'owner@example.test', avatarUrl: null, balance: '1', concurrency: 1 } };
    client.setQueryData(['session'], previous);
    client.setQueryData(['dashboard'], { private: 'old account' });
    client.setQueryData(['support', 'tickets'], { private: 'old conversation' });
    let finish!: (value: string) => void;
    const pending = client.fetchQuery({ queryKey: ['api-keys'], queryFn: () => new Promise<string>(resolve => { finish = resolve; }) }).catch(() => undefined);
    const next = destination === 'anonymous' ? { authenticated: false, playgroundEnabled: true, capabilities }
      : { ...previous, user: { ...previous.user!, id: '43' } };
    expect(await reconcileSessionQueries(client, next)).toBe(true);
    finish('old secret'); await pending;
    expect(client.getQueryCache().getAll().map(query => query.queryKey)).toEqual([['session']]);
    expect(client.getQueryData(['session'])).toBe(previous);
    client.clear();
  });
  it('does not treat initial authentication or a same-account refresh as an account switch', async () => {
    const client = new QueryClient();
    const session: SessionView = { authenticated: true, playgroundEnabled: true, capabilities, user: { id: '42', role: 'user', status: 'active', username: 'Owner', email: 'owner@example.test', avatarUrl: null, balance: '1', concurrency: 1 } };
    expect(await reconcileSessionQueries(client, session)).toBe(false);
    client.setQueryData(['session'], session); client.setQueryData(['dashboard'], { balance: 1 });
    expect(await reconcileSessionQueries(client, session)).toBe(false);
    expect(client.getQueryData(['dashboard'])).toEqual({ balance: 1 });
    client.clear();
  });
  it('clears protected metrics after a session role downgrade and cancels late report completion', async () => {
    const client = new QueryClient();
    client.setQueryData(['metrics', '42', 'overview'], { totalUsers: 5 });
    client.setQueryData(['dashboard'], { balance: 1 });
    let finish!: (value: { totalUsers: number }) => void;
    const pending = client.fetchQuery({ queryKey: ['metrics', '42', 'users'], queryFn: () => new Promise<{ totalUsers: number }>(resolve => { finish = resolve; }) }).catch(() => undefined);
    await applyMetricsAuthorizationState(client, { authenticated: true, playgroundEnabled: false, capabilities, user: { id: '42', role: 'user', status: 'active', username: 'Customer', email: 'customer@example.test', avatarUrl: null, balance: '0', concurrency: 1 } });
    finish({ totalUsers: 9 }); await pending;
    expect(client.getQueryCache().findAll({ queryKey: ['metrics'] })).toHaveLength(0);
    expect(client.getQueryData(['dashboard'])).toEqual({ balance: 1 });
    client.clear();
  });
  it('cancels a pending session read before publishing anonymous state', async () => {
    const client = new QueryClient();
    const session = { authenticated: true, playgroundEnabled: true, capabilities };
    client.setQueryData(['session'], session);
    let finish!: (value: typeof session) => void;
    const read = client.fetchQuery({ queryKey: ['session'], queryFn: () => new Promise<typeof session>(resolve => { finish = resolve; }) }).catch(() => undefined);
    await applyLoggedOutQueryState(client, capabilities);
    finish(session); await read;
    expect(client.getQueryData(['session'])).toEqual({ authenticated: false, playgroundEnabled: true, capabilities });
    client.clear();
  });

  it('keeps a resolved anonymous session while removing private account data', async () => {
    const client = new QueryClient();
    client.setQueryData<SessionView>(['session'], {
      authenticated: true, playgroundEnabled: true,
      csrfToken: 'csrf-token',
      user: {
        id: '1',
        username: 'User',
        email: 'user@example.com',
        avatarUrl: null,
        role: 'user',
        status: 'active',
        balance: '10.00',
        concurrency: 1,
        runMode: 'normal',
      },
      capabilities,
    });
    client.setQueryData(['dashboard'], { balance: 10 });
    const sessionObserver = new QueryObserver<SessionView>(client, { queryKey: ['session'], enabled: false });
    const unsubscribe = sessionObserver.subscribe(() => {});

    await applyLoggedOutQueryState(client, capabilities);

    expect(client.getQueryData(['session'])).toEqual({ authenticated: false, capabilities, playgroundEnabled: true });
    expect(client.getQueryState(['session'])?.status).toBe('success');
    expect(sessionObserver.getCurrentResult().data?.authenticated).toBe(false);
    expect(client.getQueryData(['dashboard'])).toBeUndefined();
    unsubscribe();
  });
});
