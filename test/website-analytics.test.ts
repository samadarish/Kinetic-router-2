import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../apps/bff/src/app';
import { config } from '../apps/bff/src/config';
import { createSession } from '../apps/bff/src/session-store';
import { MemoryAnalyticsStore } from '../apps/bff/src/analytics/memory-store';
import { DAY_MS, analyticsDay, type StoredEvent } from '../apps/bff/src/analytics/model';
import { readCapabilities, Sub2ApiClient } from '@kineticrouter/sub2api-client';
import type { AnalyticsBootstrap, AnalyticsOverview, AnalyticsPages, AnalyticsActions, AnalyticsAcquisition } from '@kineticrouter/portal-contract';
import { dateInTimezone, splitEngagement } from '../packages/analytics-client/src/index';

const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(async app => { await app.analytics.close(); await app.store.close(); })); vi.useRealTimers(); });
const acquisition = { referrer: 'github.com', source: 'github.com', medium: 'referral', campaign: '', device: 'Desktop', browser: 'Chrome', os: 'Windows' };
function fixture(options: Parameters<typeof createApp>[1] = {}) { const instance = createApp(undefined, { analyticsEnabled: true, ...options }); apps.push(instance); return instance; }
function user(role = 'user', status = 'active') { return { id: '42', username: 'Customer', email: 'customer@example.test', avatarUrl: null, role, status, balance: '0', concurrency: 1 }; }
async function authenticate(instance: ReturnType<typeof createApp>, role = 'user') {
  const session = createSession({ user: user(role), capabilities: readCapabilities({}, { keys: true, profile: true, redeem: true }), tokens: { accessToken: 'test-access', refreshToken: 'test-refresh', expiresAt: Date.now() + 3_600_000 } });
  await instance.store.set(session); return { session, cookie: `${config.sessionCookieName}=${session.id}` };
}
async function bootstrap(instance: ReturnType<typeof createApp>, input: { cookie?: string; origin?: string; tabId?: string; referrer?: string; disabled?: boolean; headers?: Record<string, string> } = {}) {
  const tabId = input.tabId ?? randomUUID(); const origin = input.origin ?? config.publicSiteOrigins[0]!;
  const response = await instance.app.request('/portal/v1/analytics/bootstrap', { method: 'POST', headers: { ...input.headers, origin, cookie: input.cookie ?? '', 'content-type': 'text/plain' }, body: JSON.stringify({ tabId, referrer: input.referrer ?? 'https://github.com/example', disabled: input.disabled }) });
  const payload = await response.json() as { data?: AnalyticsBootstrap };
  const cookies = new Map((input.cookie ?? '').split(';').map(item => item.trim()).filter(Boolean).map(item => [item.slice(0, item.indexOf('=')), item.slice(item.indexOf('=') + 1)]));
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(';')[0]!; const name = pair.slice(0, pair.indexOf('='));
    if (/Max-Age=0(?:;|$)/i.test(value)) cookies.delete(name); else cookies.set(name, pair.slice(pair.indexOf('=') + 1));
  }
  const cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  return { response, identity: payload.data, tabId, origin, cookie, headers: input.headers };
}
function collect(instance: ReturnType<typeof createApp>, boot: Awaited<ReturnType<typeof bootstrap>>, overrides: Record<string, unknown> = {}, cookie = boot.cookie) {
  return instance.app.request('/portal/v1/analytics/collect', { method: 'POST', headers: { ...boot.headers, origin: boot.origin, cookie, 'content-type': 'text/plain' }, body: JSON.stringify({ token: boot.identity?.token, tabId: boot.tabId, path: '/docs', visible: true, sentAt: Date.now(), sequence: 1, events: [], ...overrides }) });
}

describe('website analytics security and collection', () => {
  it('allows only the exact collector origins and does not expose admin reports cross-origin', async () => {
    const instance = fixture();
    for (const origin of [config.portalOrigin, ...config.publicSiteOrigins]) {
      const response = await instance.app.request('/portal/v1/analytics/collect', { method: 'OPTIONS', headers: { origin } });
      expect(response.status).toBe(204); expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    }
    expect((await instance.app.request('/portal/v1/analytics/bootstrap', { method: 'POST', headers: { origin: 'https://evil.test' }, body: '{}' })).status).toBe(403);
    const denied = await instance.app.request('/portal/v1/admin/analytics/live', { headers: { origin: config.publicSiteOrigins[0]! } });
    expect(denied.status).toBe(401); expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('rejects regular users, revoked admins, unknown status, and failed verification', async () => {
    let profile: Record<string, unknown> = user('admin'); let offline = false;
    const client = new Sub2ApiClient('https://account.test/api/v1', async () => { if (offline) throw new Error('offline'); return new Response(JSON.stringify({ code: 0, data: profile }), { headers: { 'content-type': 'application/json' } }); });
    const instance = fixture({ client });
    const regular = await authenticate(instance);
    expect((await instance.app.request('/portal/v1/admin/analytics/live', { headers: { cookie: regular.cookie } })).status).toBe(403);
    const admin = await authenticate(instance, 'admin');
    const allowed = await instance.app.request('/portal/v1/admin/analytics/live', { headers: { cookie: admin.cookie } });
    expect(allowed.status).toBe(200);
    profile = user('user');
    const other = await authenticate(instance, 'admin');
    expect((await instance.app.request('/portal/v1/admin/analytics/live', { headers: { cookie: other.cookie } })).status).toBe(403);
    profile = { role: 'admin', id: '42' };
    const unknown = await authenticate(instance, 'admin');
    expect((await instance.app.request('/portal/v1/admin/analytics/live', { headers: { cookie: unknown.cookie } })).status).toBe(403);
    offline = true;
    const failing = await authenticate(instance, 'admin');
    expect((await instance.app.request('/portal/v1/admin/analytics/live', { headers: { cookie: failing.cookie } })).status).toBe(503);
  });
  it('identifies customers from server sessions and invalidates collection after logout', async () => {
    const instance = fixture(); const account = await authenticate(instance);
    const boot = await bootstrap(instance, { cookie: account.cookie });
    expect(boot.identity?.enabled).toBe(true);
    expect((await collect(instance, boot)).status).toBe(204);
    expect(instance.analytics.live('all', 1, 25)).toMatchObject({ visitors: 1, customers: 1, items: [{ label: 'Customer', authenticated: true, path: '/docs' }] });
    await instance.app.request('/portal/v1/auth/logout', { method: 'POST', headers: { origin: config.portalOrigin, cookie: boot.cookie } });
    expect((await collect(instance, boot, { sequence: 2 })).status).toBe(401);
    expect(instance.analytics.live('all', 1, 25).customers).toBe(0);
  });
  it('shares browser/session identity across the website and console while counting tabs separately', async () => {
    const instance = fixture();
    const first = await bootstrap(instance);
    const second = await bootstrap(instance, { cookie: first.cookie, origin: config.portalOrigin, referrer: config.publicSiteOrigins[0] });
    expect(second.identity?.visitorId).toBe(first.identity?.visitorId); expect(second.identity?.sessionId).toBe(first.identity?.sessionId);
    await collect(instance, first); await collect(instance, second, { path: '/dashboard' });
    expect(instance.analytics.live('all', 1, 25)).toMatchObject({ visitors: 1, activeTabs: 2 });
  });
  it('does not let late heartbeats regress the current page and expires presence after 90 seconds', async () => {
    let now = Date.now(); const instance = fixture({ analyticsNow: () => now }); const boot = await bootstrap(instance);
    await collect(instance, boot, { path: '/pricing', sequence: 2, sentAt: now });
    await collect(instance, boot, { path: '/docs', sequence: 1, sentAt: now });
    expect(instance.analytics.live('all', 1, 25).items[0]?.path).toBe('/pricing');
    now += 90_001; expect(instance.analytics.live('all', 1, 25).visitors).toBe(0);
  });
  it('still excludes administrators and bots and respects the collection kill switch', async () => {
    const instance = fixture(); const admin = await authenticate(instance, 'admin');
    expect((await bootstrap(instance, { cookie: admin.cookie })).identity?.enabled).toBe(false);
    expect((await bootstrap(instance, { headers: { 'user-agent': 'ExampleBot/1.0' } })).identity?.enabled).toBe(false);
    expect((await bootstrap(fixture({ analyticsEnabled: false }))).identity?.enabled).toBe(false);
  });
  it.each([{ 'sec-gpc': '1' }, { dnt: '1' }, { 'sec-gpc': '1', dnt: '1' }])('counts visitors with browser signals %j and retires legacy exclusions', async headers => {
    const storage = new MemoryAnalyticsStore(); const instance = fixture({ analyticsStore: storage });
    const boot = await bootstrap(instance, { headers, disabled: true, cookie: 'kr_analytics_disabled=1' });
    expect(boot.identity?.enabled).toBe(true);
    expect(boot.response.headers.getSetCookie().some(value => value.startsWith('kr_analytics_disabled=') && value.includes('Max-Age=0'))).toBe(true);
    expect(boot.cookie).not.toContain('kr_analytics_disabled');
    const event = { id: randomUUID(), pageId: randomUUID(), name: 'page_view', path: '/models', at: Date.now() };
    expect((await collect(instance, boot, { path: '/models', events: [event] }, `${boot.cookie}; kr_analytics_disabled=1`)).status).toBe(204);
    expect(instance.analytics.live('all', 1, 25)).toMatchObject({ visitors: 1, items: [{ path: '/models' }], health: { collected: 1 } });
    expect(storage.facts.size).toBe(1);
  });
  it('rejects forged server actions, malformed/conflicting pages, oversized batches and tokens', async () => {
    const instance = fixture(); const boot = await bootstrap(instance); const pageId = randomUUID();
    const event = { id: randomUUID(), pageId, name: 'page_view', path: '/docs', at: Date.now() };
    expect((await collect(instance, boot, { events: [{ ...event, name: 'api_key_created' }] })).status).toBe(400);
    expect((await collect(instance, boot, { events: [event, { ...event, id: randomUUID(), path: '/pricing' }] })).status).toBe(400);
    expect((await collect(instance, boot, { token: 'forged' })).status).toBe(401);
    expect((await collect(instance, boot, { events: Array.from({ length: 21 }, () => event) })).status).toBe(400);
    const oversized = await instance.app.request('/portal/v1/analytics/collect', { method: 'POST', headers: { origin: boot.origin }, body: 'x'.repeat(16_385) });
    expect(oversized.status).toBe(413);
  });
  it('stores clean page paths, classifies referrers, and does not persist empty heartbeats', async () => {
    const storage = new MemoryAnalyticsStore(); const instance = fixture({ analyticsStore: storage }); const boot = await bootstrap(instance);
    for (let sequence = 1; sequence <= 4; sequence++) await collect(instance, boot, { sequence });
    expect(storage.facts.size).toBe(0); expect(storage.events.size).toBe(0);
    const event = { id: randomUUID(), pageId: randomUUID(), name: 'page_view', path: '/docs?key=secret#fragment', at: Date.now() };
    expect((await collect(instance, boot, { sequence: 5, events: [event] })).status).toBe(204);
    expect([...storage.facts.values()][0]?.path).toBe('/docs');
    expect([...storage.sessions.values()][0]).toMatchObject({ source: 'github.com', medium: 'referral' });
  });
  it('fails collection safely during a storage outage while account liveness stays available', async () => {
    const storage = new MemoryAnalyticsStore(); const instance = fixture({ analyticsStore: storage }); const boot = await bootstrap(instance);
    vi.spyOn(storage, 'write').mockRejectedValue(new Error('database down'));
    const event = { id: randomUUID(), pageId: randomUUID(), name: 'page_view', path: '/docs', at: Date.now() };
    expect((await collect(instance, boot, { events: [event] })).status).toBe(503);
    expect((await instance.app.request('/healthz')).status).toBe(200);
    expect(instance.analytics.live('all', 1, 25).health.storageAvailable).toBe(false);
  });
  it('records successful account actions on the server without storing submitted secrets', async () => {
    const storage = new MemoryAnalyticsStore();
    const upstream = new Sub2ApiClient('https://account.test/api/v1', async input => {
      const path = new URL(String(input)).pathname;
      const data = path.endsWith('/auth/login') ? { user: user(), access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 3600 }
        : path.endsWith('/keys') ? { id: 1, name: 'Testing', key: 'fixture-api-key', status: 'active' }
        : path.endsWith('/redeem') ? { type: 'balance', value: '5', new_balance: '5', message: 'Redeemed' } : {};
      return new Response(JSON.stringify({ code: 0, data }), { headers: { 'content-type': 'application/json' } });
    });
    const instance = fixture({ analyticsStore: storage, client: upstream, writeGates: { keys: true, redeem: true } });
    const boot = await bootstrap(instance, { headers: { 'sec-gpc': '1', dnt: '1' } });
    const login = await instance.app.request('/portal/v1/auth/password/login', { method: 'POST', headers: { ...boot.headers, origin: config.portalOrigin, cookie: `${boot.cookie}; kr_analytics_disabled=1`, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'customer@example.test', password: 'fixture-password' }) }, { incoming: { socket: { remoteAddress: '127.0.0.1', remotePort: 12345, remoteFamily: 'IPv4' } } });
    expect(login.status).toBe(200);
    const payload = await login.json() as { data: { csrfToken: string } };
    const headers = { ...boot.headers, origin: config.portalOrigin, cookie: `${boot.cookie}; ${login.headers.get('set-cookie')!.split(';')[0]}; kr_analytics_disabled=1`, 'content-type': 'application/json', 'x-csrf-token': payload.data.csrfToken };
    expect((await instance.app.request('/portal/v1/api-keys', { method: 'POST', headers, body: JSON.stringify({ name: 'Testing' }) })).status).toBe(201);
    expect((await instance.app.request('/portal/v1/redemptions', { method: 'POST', headers, body: JSON.stringify({ code: 'fixture-redemption-code' }) })).status).toBe(200);
    await vi.waitFor(() => expect(storage.actions.size).toBe(3));
    expect([...storage.actions.values()].map(event => event.name).sort()).toEqual(['api_key_created', 'redemption', 'sign_in']);
    expect(new Set([...storage.actions.values()].map(event => event.sessionId)).size).toBe(1);
    expect(JSON.stringify([...storage.events.values()])).not.toMatch(/fixture-password|fixture-api-key|fixture-redemption-code|customer@example/);
  });
  it('rate-limits one collection token without touching account endpoints', async () => {
    const instance = fixture(); const boot = await bootstrap(instance);
    for (let sequence = 1; sequence <= 120; sequence++) expect((await collect(instance, boot, { sequence })).status).toBe(204);
    expect((await collect(instance, boot, { sequence: 121 })).status).toBe(429);
    expect((await instance.app.request('/healthz')).status).toBe(200);
  });
  it('revalidates cached administrator permissions after thirty seconds', async () => {
    let profile = user('admin'); let checks = 0; const time = Date.now();
    const client = new Sub2ApiClient('https://account.test/api/v1', async () => { checks++; return new Response(JSON.stringify({ code: 0, data: profile }), { headers: { 'content-type': 'application/json' } }); });
    const instance = fixture({ client }); const admin = await authenticate(instance, 'admin');
    expect((await instance.app.request('/portal/v1/admin/analytics/live', { headers: { cookie: admin.cookie } })).status).toBe(200);
    expect((await instance.app.request('/portal/v1/admin/analytics/live', { headers: { cookie: admin.cookie } })).status).toBe(200); expect(checks).toBe(1);
    profile = user('user'); const clock = vi.spyOn(Date, 'now').mockReturnValue(time + 31_000);
    try { expect((await instance.app.request('/portal/v1/admin/analytics/live', { headers: { cookie: admin.cookie } })).status).toBe(403); expect(checks).toBe(2); } finally { clock.mockRestore(); }
  });
});

describe('website analytics counting', () => {
  it('deduplicates visitors across surfaces/days and preserves engagement high-water marks', async () => {
    const storage = new MemoryAnalyticsStore(); const now = Date.now(); const firstDay = analyticsDay(now - DAY_MS, 'Asia/Kolkata'); const today = analyticsDay(now, 'Asia/Kolkata');
    const visitorId = randomUUID(); const session = await storage.session(visitorId, acquisition, now - DAY_MS); const pageId = randomUUID();
    const event: StoredEvent = { id: randomUUID(), pageId, day: firstDay, sessionId: session.id, visitorId, surface: 'site', path: '/docs', at: now - DAY_MS, name: 'page_view' };
    await storage.write([event, event]);
    for (const engagementMs of [10_000, 20_000, 15_000]) await storage.write([{ ...event, id: randomUUID(), name: 'engagement', engagementMs }]);
    await storage.write([{ ...event, id: randomUUID(), pageId: randomUUID(), day: today, surface: 'console', path: '/dashboard', at: now }]);
    const second = await storage.session(randomUUID(), acquisition, now);
    await storage.write([{ ...event, id: randomUUID(), pageId: randomUUID(), visitorId: second.visitorId, sessionId: second.id, day: today, at: now }]);
    const query = { startDate: firstDay, endDate: today, surface: 'all' as const, page: 1, pageSize: 25, search: '' };
    const overview = await storage.report('overview', query, now) as AnalyticsOverview;
    expect(overview.totals).toMatchObject({ visitors: 2, sessions: 2, pageviews: 3, averageEngagementMs: 10_000 });
    expect(overview.trend.map(row => row.visitors)).toEqual([1, 2]);
    const pages = await storage.report('pages', query, now) as AnalyticsPages;
    expect(pages.items.find(row => row.path === '/docs')?.engagementMs).toBe(20_000);
  });
  it('preserves ordered funnels even when events arrive out of order or share a timestamp', async () => {
    const storage = new MemoryAnalyticsStore(); const now = Date.now(); const session = await storage.session(randomUUID(), acquisition, now); const day = analyticsDay(now, 'Asia/Kolkata');
    const base = { pageId: randomUUID(), day, sessionId: session.id, visitorId: session.visitorId, surface: 'console' as const, path: '/sign-in' };
    await storage.write([{ ...base, id: randomUUID(), at: now + 5, name: 'sign_in' }, { ...base, id: randomUUID(), at: now + 12, name: 'api_key_created' }, { ...base, id: randomUUID(), at: now + 10, name: 'cta_click' }, { ...base, id: randomUUID(), at: now + 11, name: 'sign_in' }]);
    const query = { startDate: day, endDate: day, surface: 'all' as const, page: 1, pageSize: 25, search: '' };
    expect(((await storage.report('actions', query, now)) as AnalyticsActions).funnel.map(step => step.sessions)).toEqual([1, 1, 1]);
    const sources = await storage.report('acquisition', query, now) as AnalyticsAcquisition; expect(sources.sources[0]?.label).toBe('github.com / referral');
  });
  it('retains reporting facts when 90-day detailed events expire', async () => {
    const storage = new MemoryAnalyticsStore(); const now = Date.now(); const at = now - 100 * DAY_MS; const session = await storage.session(randomUUID(), acquisition, at); const day = analyticsDay(at, 'Asia/Kolkata');
    await storage.write([{ id: randomUUID(), pageId: randomUUID(), day, at, path: '/docs', surface: 'site', name: 'page_view', sessionId: session.id, visitorId: session.visitorId }]);
    await storage.maintain(now); expect(storage.events.size).toBe(0);
    expect(((await storage.report('overview', { startDate: day, endDate: day, surface: 'all', search: '', page: 1, pageSize: 25 }, now)) as AnalyticsOverview).totals.pageviews).toBe(1);
  });
  it('splits engagement at reporting midnight and through daylight-saving boundaries', () => {
    const midnight = Date.parse('2026-09-05T18:30:00Z');
    expect(splitEngagement(midnight - 8000, midnight + 12000, 'Asia/Kolkata')).toEqual([{ day: '2026-09-05', ms: 8000 }, { day: '2026-09-06', ms: 12000 }]);
    expect(splitEngagement(1000, 1000, 'UTC')).toEqual([]);
    const dst = Date.parse('2026-03-08T07:00:00Z'); expect(splitEngagement(dst - 5000, dst + 5000, 'America/New_York')).toEqual([{ day: '2026-03-08', ms: 10_000 }]);
    expect(dateInTimezone(midnight, 'Asia/Kolkata')).toBe('2026-09-06');
  });
});
