import { afterEach, describe, expect, it } from 'vitest';
import { Sub2ApiClient, readCapabilities } from '@kineticrouter/sub2api-client';
import { createApp } from '../apps/bff/src/app';
import { createSession } from '../apps/bff/src/session-store';
import { config } from '../apps/bff/src/config';

const instances: ReturnType<typeof createApp>[] = [];
afterEach(async () => { await Promise.all(instances.splice(0).map(async instance => { await instance.analytics.close(); await instance.store.close(); })); });
const profile = (role = 'admin', status = 'active') => ({ id: '42', role, status, username: 'Administrator', email: 'admin@example.test', avatarUrl: null, balance: '0', concurrency: 1 });
const capabilities = () => readCapabilities({}, { keys: false, profile: false, redeem: false });
async function fixture(role = 'admin', status = 'active', verification: 'ok' | 'revoked' | 'offline' = 'ok') {
  const requests: Array<{ path: string; headers: Headers }> = [];
  const client = new Sub2ApiClient('https://account.test/api/v1', async (input, init) => {
    const url = new URL(String(input)), path = url.pathname.replace('/api/v1/', '');
    requests.push({ path, headers: new Headers(init?.headers) });
    let data: unknown;
    if (path === 'user/profile') { if (verification === 'offline') throw new Error('offline'); data = profile(verification === 'revoked' ? 'user' : role, status); }
    else if (path === 'settings/public') data = { server_timezone: config.serverTimezone };
    else if (path === 'admin/users') data = { items: [{ id: 1, username: 'Customer', email: 'customer@example.test', role: 'user', status: 'disabled', notes: 'never serialized', balance: 987654321 }], total: 1, page: 1 };
    else if (path === 'admin/usage') data = { items: [] };
    else if (path === 'admin/dashboard/users-trend') data = { granularity: url.searchParams.get('granularity'), trend: [] };
    else throw new Error(path);
    return new Response(JSON.stringify({ code: 0, data }), { headers: { 'content-type': 'application/json' } });
  });
  const instance = createApp(undefined, { client, analyticsEnabled: true }); instances.push(instance);
  const session = createSession({ user: profile(role, status), tokens: { accessToken: 'fixture-access', refreshToken: 'fixture-refresh', expiresAt: Date.now() + 3600000 }, capabilities: capabilities() });
  await instance.store.set(session);
  return { ...instance, requests, headers: { cookie: `${config.sessionCookieName}=${session.id}` } };
}
const paths = [
  ...['overview', 'users', 'activity', 'averages'].map(kind => `/portal/v1/admin/metrics/${kind}?startDate=2026-09-01&endDate=2026-09-14`),
  ...['overview', 'users', 'activity'].map(kind => `/portal/v1/admin/metrics/${kind}?range=all-time`),
  '/portal/v1/admin/metrics/activity?range=all-time&source=console',
  '/portal/v1/admin/metrics/averages?scope=all-time',
  '/portal/v1/admin/metrics/peaks',
  '/portal/v1/admin/metrics/peaks?scope=all-time',
];
describe('admin metrics security boundary', () => {
  it('rejects unauthenticated and regular customer requests on every endpoint', async () => {
    const f = await fixture('user');
    for (const path of paths) {
      expect((await f.app.request(path)).status).toBe(401);
      expect((await f.app.request(path, { headers: f.headers })).status).toBe(403);
    }
    expect(f.requests).toHaveLength(0);
  });
  it.each([['disabled', 'ok', 403], ['active', 'revoked', 403], ['active', 'offline', 503]] as const)('rejects admin status %s and verification %s', async (status, verification, expected) => {
    const f = await fixture('admin', status, verification);
    for (const path of paths) expect((await f.app.request(path, { headers: f.headers })).status).toBe(expected);
    expect(f.requests.every(request => request.path === 'user/profile')).toBe(true);
  });
  it('serves sanitized customer reports through verified admin requests and protects cached results', async () => {
    const f = await fixture();
    for (const path of paths) {
      const response = await f.app.request(path, { headers: f.headers });
      expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('no-store');
      const body = await response.text(); expect(body).not.toContain('never serialized'); expect(body).not.toContain('987654321'); expect(body).not.toContain('fixture-access');
    }
    const upstream = f.requests.find(request => request.path === 'admin/users')!;
    expect(upstream.headers.get('x-admin-ui-request')).toBe('1'); expect(upstream.headers.has('x-user-ui-request')).toBe(false);
    const customer = createSession({ user: profile('user'), tokens: { accessToken: 'other', refreshToken: 'other', expiresAt: Date.now() + 3600000 }, capabilities: capabilities() });
    await f.store.set(customer);
    expect((await f.app.request(paths[0]!, { headers: { cookie: `${config.sessionCookieName}=${customer.id}` } })).status).toBe(403);
  });
  it('rejects invalid dates before requesting customer usage', async () => {
    const f = await fixture();
    expect((await f.app.request('/portal/v1/admin/metrics/users?startDate=2026-02-30&endDate=2026-09-14', { headers: f.headers })).status).toBe(400);
    expect((await f.app.request('/portal/v1/admin/metrics/peaks?scope=invalid', { headers: f.headers })).status).toBe(400);
    expect(f.requests.every(request => request.path === 'user/profile')).toBe(true);
  });
});
