import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usageSummarySchema } from '@kineticrouter/portal-contract';
import {
  Sub2ApiClient, mapAnnouncement, mapApiKey, mapChannel, mapDashboardStats, mapGroup,
  mapRedeemResult, mapRedemption, mapSubscription, mapUsageEndpoints, mapUsageError,
  mapUsageEvent, mapUsageGroups, mapUsageModels, mapUsageRangeStats, mapUsageTrend, mapUser, readCapabilities,
} from '@kineticrouter/sub2api-client';
import { createApp } from '../apps/bff/src/app';
import { config } from '../apps/bff/src/config';
import { createSession } from '../apps/bff/src/session-store';
import {
  publicAnnouncement, publicApiKey, publicCapabilities, publicChannel, publicDashboardStats,
  publicGroup, publicRedeemResult, publicRedemption, publicSubscription, publicUsageEndpoint,
  publicUsageError, publicUsageEvent, publicUsageGroup, publicUsageModel, publicUsageRangeStats,
  publicUsageTrendPoint, publicUser,
} from '../apps/bff/src/public-serializers';

const forbiddenNames = [
  'rateMultiplier', 'rate_multiplier', 'userRateMultiplier', 'user_rate_multiplier',
  'resolvedRateMultiplier', 'resolved_rate_multiplier', 'effectiveRateMultiplier', 'effective_rate_multiplier',
  'standardCost', 'standard_cost', 'totalCost', 'total_cost', 'errorBody', 'error_body',
];
const internalMetadata = Object.fromEntries(forbiddenNames.map(name => [name, '7.2500']));
function contaminated<T extends object>(value: T) {
  return { ...value, ...internalMetadata, unexpectedBillingMetadata: { ...internalMetadata, privateToken: 'upstream-secret' } };
}
function expectCustomerSafe(value: unknown) {
  if (!value || typeof value !== 'object') return;
  for (const [name, child] of Object.entries(value)) {
    expect(forbiddenNames, `Unexpected public property: ${name}`).not.toContain(name);
    expect(name).not.toBe('unexpectedBillingMetadata');
    expectCustomerSafe(child);
  }
}
function json(value: unknown): unknown { return JSON.parse(JSON.stringify(value)); }

const rawGroup = contaminated({
  id: 7, name: 'OpenAI', description: 'Model access', platform: 'openai', subscription_type: 'standard',
  daily_limit_usd: '10.25', weekly_limit_usd: '40.50', monthly_limit_usd: '99.00',
});
const rawKey = contaminated({
  id: 12, name: 'Production', key: 'sk-kinetic-test-1234567890', status: 'active', group_id: 7, group: rawGroup,
  current_concurrency: 2, quota: '25.5000', quota_used: '0.0123456789',
  rate_limit_5h: '5.00', rate_limit_1d: '12.00', rate_limit_7d: '20.00',
  usage_5h: '0.001', usage_1d: '0.002', usage_7d: '0.003',
  reset_5h_at: '2026-08-30T12:00:00Z', reset_1d_at: '2026-08-31T00:00:00Z', reset_7d_at: '2026-09-06T00:00:00Z',
  ip_whitelist: ['203.0.113.10'], ip_blacklist: ['198.51.100.25'],
  created_at: '2026-08-01T00:00:00Z', expires_at: '2027-01-01T00:00:00Z', last_used_at: '2026-08-30T10:00:00Z',
});
const rawSubscription = contaminated({
  id: 3, group_id: 7, group: rawGroup, status: 'active', starts_at: '2026-08-01T00:00:00Z', expires_at: '2027-01-01T00:00:00Z',
  daily_usage_usd: '0.0123456789', weekly_usage_usd: '0.0234567890', monthly_usage_usd: '0.0345678901',
});
const rawEvent = contaminated({
  id: 22, created_at: '2026-08-30T10:00:00Z', api_key: rawKey, group: rawGroup,
  model: 'openai/gpt-5.4-mini', requested_model: 'openai/gpt-5.4-mini',
  input_tokens: 123, output_tokens: 45, cache_read_tokens: 67, cache_creation_tokens: 8,
  actual_cost: '0.0123456789', first_token_ms: 234, duration_ms: 567,
  inbound_endpoint: '/v1/responses', stream: true, request_type: 'stream', billing_mode: 'token', billing_type: 1,
  reasoning_effort: 'xhigh', reasoning_tokens: 17,
});
const rawAggregate = contaminated({
  requests: 2, input_tokens: 123, output_tokens: 45, cache_read_tokens: 67, cache_creation_tokens: 8,
  total_tokens: 243, actual_cost: '0.0123456789', cost: '0.0900000000',
  model: rawEvent.model, group_id: 7, group_name: 'OpenAI', endpoint: '/v1/responses', date: '2026-08-30 10:00',
});
const rawStats = contaminated({
  total_requests: 2, total_input_tokens: 123, total_output_tokens: 45, total_cache_read_tokens: 67,
  total_cache_creation_tokens: 8, total_tokens: 243, total_actual_cost: '0.0123456789',
  average_duration_ms: 567, endpoints: [rawAggregate],
});
const rawUser = contaminated({
  id: 1, username: 'Customer', email: 'customer@example.com', role: 'user', status: 'active',
  balance: '12.3456789000', concurrency: 3,
});
const pagination = (item: unknown) => contaminated({ items: [item], total: 1, page: 1, page_size: 20, pages: 1 });

describe('explicit public serializers', () => {
  it('excludes runtime additions even after upstream mapping and preserves nested customer fields', () => {
    const group = contaminated(mapGroup(rawGroup));
    const key = contaminated({ ...mapApiKey(rawKey), group });
    const subscription = contaminated({ ...mapSubscription(rawSubscription), group });
    const event = contaminated(mapUsageEvent(rawEvent));
    const values = [publicGroup(group), publicApiKey(key), publicSubscription(subscription), publicUsageEvent(event)];
    for (const value of values) expectCustomerSafe(json(value));
    expect(json(publicGroup(group))).toEqual({ id: '7', name: 'OpenAI', description: 'Model access', platform: 'openai', subscriptionType: 'standard' });
    expect(publicApiKey(key)).toMatchObject({ key: rawKey.key, quota: '25.5000', quotaUsed: '0.0123456789', usage5h: '0.001' });
    expect(publicSubscription(subscription)).toMatchObject({ dailyUsageUsd: '0.0123456789', dailyLimitUsd: '10.25' });
    expect(publicUsageEvent(event)).toMatchObject({ actualCost: '0.0123456789', inputTokens: 123, outputTokens: 45, cacheReadTokens: 67, cacheCreationTokens: 8 });
    // Serialization cannot change the internal accounting/reference values.
    expect(group.rateMultiplier).toBe('7.2500');
    expect(mapUsageEvent(rawEvent).totalCost).toBe('7.2500');
    expect(mapUsageRangeStats(rawStats).standardCost).toBe('7.2500');
  });

  it('allowlists all usage aggregates and auxiliary customer DTOs, including nested arrays', () => {
    const channel = mapChannel({ id: 1, name: 'OpenAI', provider: 'openai', models: [{ model: 'gpt-5.4-mini', latest_status: 'healthy' }] });
    const dashboard = mapDashboardStats({ total_actual_cost: '0.0123456789', by_platform: [{ platform: 'openai', total_actual_cost: '0.0123456789' }] });
    const values = [
      publicUsageRangeStats(contaminated(mapUsageRangeStats(rawStats))),
      publicUsageTrendPoint(contaminated(mapUsageTrend([rawAggregate])[0]!)),
      publicUsageModel(contaminated(mapUsageModels([rawAggregate])[0]!)),
      publicUsageGroup(contaminated(mapUsageGroups([rawAggregate])[0]!)),
      publicUsageEndpoint(contaminated(mapUsageEndpoints([rawAggregate])[0]!)),
      publicUsageError(contaminated(mapUsageError({ id: 1, status_code: 400, message: 'Check your model.' }))),
      publicChannel(contaminated({ ...channel, models: channel.models?.map(contaminated) })),
      publicDashboardStats(contaminated({ ...dashboard, byPlatform: dashboard.byPlatform.map(contaminated) })),
      publicUser(contaminated(mapUser(rawUser))),
      publicCapabilities(contaminated(readCapabilities({}, { keys: true, profile: true, redeem: true }))),
      publicRedemption(contaminated(mapRedemption({ id: 1, value: '3.5000', group: rawGroup }))),
      publicRedeemResult(contaminated(mapRedeemResult({ value: '3.5000', new_balance: '15.8456789000' }))),
      publicAnnouncement(contaminated(mapAnnouncement({ id: 1, title: 'Notice', content: 'Hello.' }))),
    ];
    for (const value of values) expectCustomerSafe(json(value));
    for (const value of values.slice(0, 5)) expect(value).toHaveProperty('actualCost', '0.0123456789');
  });

  it('omits debug bodies and replaces internal metadata embedded in error strings', () => {
    const mapped = mapUsageError({ id: 1, status_code: 400, message: JSON.stringify(internalMetadata), error_body: JSON.stringify(internalMetadata), category: 'effective_rate_multiplier_invalid' });
    expect(mapped.errorBody).toBe(JSON.stringify(internalMetadata));
    const response = json(publicUsageError(mapped));
    expectCustomerSafe(response);
    expect(response).toMatchObject({ message: 'The request could not be completed.', category: 'request_error' });
    for (const field of forbiddenNames) expect(JSON.stringify(response)).not.toContain(field);
  });
});

describe('authenticated customer response serialization', () => {
  let instance: ReturnType<typeof createApp>;
  let session: ReturnType<typeof createSession>;
  let headers: Record<string, string>;
  let writeHasKey: boolean;
  const fetcher = vi.fn<typeof fetch>();

  beforeEach(async () => {
    writeHasKey = true;
    fetcher.mockReset();
    fetcher.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname.replace('/api/v1/', '');
      let data: unknown;
      if (path === 'groups/available') data = [rawGroup];
      else if (path === 'subscriptions') data = contaminated({ items: [rawSubscription] });
      else if (path === 'keys' && init?.method === 'GET') data = pagination(rawKey);
      else if (path === 'keys' || path === 'keys/12') data = init?.method === 'GET' || writeHasKey ? rawKey : contaminated({ id: 12, message: 'Saved', group: rawGroup });
      else if (path === 'usage') data = pagination(rawEvent);
      else if (path === 'usage/stats') data = rawStats;
      else if (path === 'usage/dashboard/models') data = contaminated({ models: [rawAggregate] });
      else if (path === 'usage/dashboard/snapshot-v2') data = contaminated({ trend: [rawAggregate], groups: [rawAggregate] });
      else if (path === 'usage/dashboard/stats') data = contaminated({ total_actual_cost: '0.0123456789', total_tokens: 243, by_platform: [rawAggregate] });
      else if (path === 'user/profile' || path === 'user') data = rawUser;
      else if (path === 'usage/errors') data = pagination(contaminated({ id: 1, status_code: 400, message: JSON.stringify(internalMetadata), error_body: JSON.stringify(internalMetadata), category: 'resolved_rate_multiplier_invalid' }));
      else if (path === 'usage/errors/1') data = contaminated({ id: 1, status_code: 400, message: JSON.stringify(internalMetadata), error_body: JSON.stringify(internalMetadata), category: 'resolved_rate_multiplier_invalid' });
      else if (path === 'channel-monitors') data = [contaminated({ id: 1, name: 'OpenAI', provider: 'openai', models: [contaminated({ model: 'gpt-5.4-mini', latest_status: 'healthy' })] })];
      else if (path === 'redeem/history') data = [contaminated({ id: 1, value: '3.5000', group: rawGroup })];
      else if (path === 'announcements') data = [contaminated({ id: 1, title: 'Notice', content: 'Hello.' })];
      else if (path === 'settings/public') data = contaminated({});
      else throw new Error(`Unexpected fixture request: ${path}`);
      return new Response(JSON.stringify({ code: 0, data }), { headers: { 'content-type': 'application/json' } });
    });
    instance = createApp(undefined, {
      client: new Sub2ApiClient('https://account.invalid/api/v1', fetcher), analyticsEnabled: false,
      writeGates: { keys: true, profile: true, redeem: true, announcements: true },
    });
    session = createSession({
      user: contaminated(mapUser(rawUser)),
      capabilities: contaminated(readCapabilities({}, { keys: true, profile: true, redeem: true })),
      tokens: { accessToken: 'server-access-token', refreshToken: 'server-refresh-token', expiresAt: Date.now() + 600_000 },
    });
    await instance.store.set(session);
    headers = { cookie: `${config.sessionCookieName}=${session.id}`, origin: config.portalOrigin, 'x-csrf-token': session.csrfToken, 'content-type': 'application/json' };
  });

  afterEach(async () => { await instance.store.close(); });

  it.each([
    '/groups', '/subscriptions', '/api-keys', '/api-keys/12', '/usage/events',
    '/usage/summary?startDate=2026-08-29&endDate=2026-08-30',
    '/dashboard', '/me', '/auth/session', '/public-session', '/config', '/capabilities',
    '/usage/errors', '/usage/errors/1', '/channels/status', '/redemptions', '/announcements',
  ])('keeps raw internal properties out of GET %s', async path => {
    const response = await instance.app.request(`/portal/v1${path}`, { headers: { cookie: headers.cookie! } });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expectCustomerSafe(payload);
    expect(JSON.stringify(payload)).not.toMatch(/server-access-token|server-refresh-token|upstream-secret/);
    for (const field of forbiddenNames) expect(JSON.stringify(payload)).not.toContain(field);
  });

  it('retains precise billed cost, every token count, pagination, quota windows, subscription limits, and balance', async () => {
    const get = async (path: string) => (await (await instance.app.request(`/portal/v1${path}`, { headers })).json()).data;
    const events = await get('/usage/events');
    expect(events).toMatchObject({ total: 1, page: 1, pageSize: 20, pages: 1 });
    expect(events.items[0]).toMatchObject({ id: '22', model: rawEvent.model, apiKeyName: 'Production', actualCost: '0.0123456789', inputTokens: 123, outputTokens: 45, cacheReadTokens: 67, cacheCreationTokens: 8, firstTokenMs: 234, durationMs: 567 });
    const summary = await get('/usage/summary?startDate=2026-08-29&endDate=2026-08-30');
    expect(usageSummarySchema.safeParse(summary).success).toBe(true);
    expect(summary.stats).toMatchObject({ actualCost: '0.0123456789', totalTokens: 243, totalInputTokens: 123, totalOutputTokens: 45, totalCacheReadTokens: 67, totalCacheCreationTokens: 8 });
    for (const rows of [summary.models, summary.trend, summary.groups, summary.endpoints]) expect(rows[0]).toMatchObject({ actualCost: '0.0123456789', totalTokens: 243 });
    const keys = await get('/api-keys');
    expect(keys.items[0]).toMatchObject({ key: rawKey.key, quota: '25.5000', quotaUsed: '0.0123456789', rateLimit5h: '5.00', rateLimit1d: '12.00', rateLimit7d: '20.00', usage5h: '0.001', usage1d: '0.002', usage7d: '0.003', ipWhitelist: ['203.0.113.10'], ipBlacklist: ['198.51.100.25'] });
    expect(keys.items[0].maskedKey).not.toContain('1234567890');
    expect((await get('/subscriptions'))[0]).toMatchObject({ dailyUsageUsd: '0.0123456789', weeklyUsageUsd: '0.0234567890', monthlyUsageUsd: '0.0345678901', dailyLimitUsd: '10.25', weeklyLimitUsd: '40.50', monthlyLimitUsd: '99.00' });
    expect(await get('/me')).toMatchObject({ balance: '12.3456789000', concurrency: 3 });
    expect((await instance.store.get(session.id))?.user.balance).toBe('12.3456789000');
    expect(fetcher.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
  });

  it.each([['POST', '/api-keys', 201], ['PATCH', '/api-keys/12', 200]] as const)('sanitizes %s key responses with nested groups', async (method, path, status) => {
    const response = await instance.app.request(`/portal/v1${path}`, { method, headers, body: JSON.stringify({ name: 'Production' }) });
    expect(response.status).toBe(status);
    const payload = await response.json();
    expectCustomerSafe(payload);
    expect(payload.data).toMatchObject({ id: '12', key: rawKey.key, quotaUsed: '0.0123456789', group: { id: '7', name: 'OpenAI' } });
  });

  it.each([['POST', '/api-keys', { created: true }], ['PATCH', '/api-keys/12', { updated: true }]] as const)('returns an allowlisted acknowledgement for %s without a key body', async (method, path, expected) => {
    writeHasKey = false;
    const response = await instance.app.request(`/portal/v1${path}`, { method, headers, body: JSON.stringify({ name: 'Production' }) });
    const payload = await response.json();
    expect(response.status).toBe(method === 'POST' ? 201 : 200);
    expectCustomerSafe(payload);
    expect(payload.data).toEqual(expected);
  });

  it('preserves customer authentication and CSRF requirements', async () => {
    expect((await instance.app.request('/portal/v1/groups')).status).toBe(401);
    expect((await instance.app.request('/portal/v1/api-keys', { method: 'POST', headers: { cookie: headers.cookie!, origin: config.portalOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Production' }) })).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
