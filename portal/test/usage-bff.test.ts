import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.hoisted(() => vi.fn());

vi.mock('@kineticrouter/sub2api-client', async () => {
  const actual = await vi.importActual<typeof import('@kineticrouter/sub2api-client')>('@kineticrouter/sub2api-client');
  return {
    ...actual,
    Sub2ApiClient: class {
      request = requestMock;
      publicSettings = vi.fn(async () => ({}));
      refresh = vi.fn();
    },
  };
});

import { createApp } from '../apps/bff/src/app';
import { config } from '../apps/bff/src/config';
import { createSession } from '../apps/bff/src/session-store';

const { app, store } = createApp();

afterAll(async () => { await store.close(); });
beforeEach(() => requestMock.mockReset());

describe('usage analytics BFF', () => {
  it('queries the three authoritative aggregates with one range and timezone', async () => {
    requestMock.mockImplementation(async (path: string) => {
      if (!path) return {};
      if (path.startsWith('usage/stats?')) return {
        total_requests: 3,
        total_input_tokens: 100,
        total_output_tokens: 50,
        total_cache_read_tokens: 75,
        total_cache_creation_tokens: 25,
        total_tokens: 250,
        total_cost: '0.4',
        total_actual_cost: '0.2',
        average_duration_ms: 500,
        endpoints: [{ endpoint: '/v1/responses', requests: 3, total_tokens: 250, cost: '0.4', actual_cost: '0.2' }],
      };
      if (path.startsWith('usage/dashboard/models?')) return { models: [{ model: 'gpt-5.6-sol', requests: 3, total_tokens: 250, cost: '0.4', actual_cost: '0.2' }] };
      if (path.startsWith('usage/dashboard/snapshot-v2?')) return {
        trend: [{ date: '2026-08-30 13:00', requests: 3, input_tokens: 100, output_tokens: 50, cache_read_tokens: 75, cache_creation_tokens: 25, total_tokens: 250, cost: '0.4', actual_cost: '0.2' }],
        groups: [{ group_id: 1, group_name: 'OpenAI', requests: 3, total_tokens: 250, cost: '0.4', actual_cost: '0.2' }],
      };
      throw new Error(`Unexpected upstream path: ${path}`);
    });
    const session = await authenticatedSession();
    const response = await app.request('/portal/v1/usage/summary?startDate=2026-08-29&endDate=2026-08-30', {
      headers: { cookie: `${config.sessionCookieName}=${session.id}` },
    });
    const payload = await response.json() as { data: { range: { granularity: string; timezone: string }; stats: { cacheHitRate: number }; groups: unknown[]; endpoints: unknown[] } };

    expect(response.status).toBe(200);
    expect(payload.data.range).toMatchObject({ granularity: 'hour', timezone: config.serverTimezone });
    expect(payload.data.stats.cacheHitRate).toBe(37.5);
    expect(payload.data.groups).toHaveLength(1);
    expect(payload.data.endpoints).toHaveLength(1);
    const paths = requestMock.mock.calls.map(([path]) => String(path));
    expect(paths).toContain('usage/stats?start_date=2026-08-29&end_date=2026-08-30');
    expect(paths).toContain('usage/dashboard/models?start_date=2026-08-29&end_date=2026-08-30&model_source=requested');
    expect(paths).toContain('usage/dashboard/snapshot-v2?start_date=2026-08-29&end_date=2026-08-30&granularity=hour&include_trend=true&include_model_stats=false&include_group_stats=true');
    for (const [, , options] of requestMock.mock.calls) expect(options).toMatchObject({ timezone: config.serverTimezone, userUiRequest: true });
  });

  it('rejects reversed dates before calling Sub2API', async () => {
    const session = await authenticatedSession();
    const response = await app.request('/portal/v1/usage/summary?startDate=2026-08-31&endDate=2026-08-30', {
      headers: { cookie: `${config.sessionCookieName}=${session.id}` },
    });
    expect(response.status).toBe(400);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('rejects future and overlong ranges before calling Sub2API', async () => {
    const session = await authenticatedSession();
    const headers = { cookie: `${config.sessionCookieName}=${session.id}` };
    const future = await app.request('/portal/v1/usage/summary?startDate=2099-01-01&endDate=2099-01-02', { headers });
    const overlong = await app.request('/portal/v1/usage/summary?startDate=2024-01-01&endDate=2025-01-02', { headers });
    expect(future.status).toBe(400);
    expect(overlong.status).toBe(400);
    expect(requestMock).not.toHaveBeenCalled();
  });
});

async function authenticatedSession() {
  const session = createSession({
    user: { id: '1', username: 'Kishore', email: 'kishore@example.com', avatarUrl: null, role: 'user', status: 'active', balance: '10', concurrency: 1 },
    capabilities: {
      registration: false,
      passwordReset: false,
      totp: false,
      passkeys: false,
      google: false,
      payments: false,
      subscriptionPurchase: false,
      modelPlaza: false,
      availableChannels: true,
      channelMonitor: true,
      channelMonitorMode: 'v1',
      affiliate: false,
      usageErrors: false,
      promoCode: true,
      keyWrites: false,
      profileWrites: false,
      redeemWrites: false,
      announcementWrites: false,
    },
    tokens: { accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 60_000 },
  });
  await store.set(session);
  return session;
}
