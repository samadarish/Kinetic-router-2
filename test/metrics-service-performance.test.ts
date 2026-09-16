import { afterEach, describe, expect, it, vi } from 'vitest';
import { metricsActivitySchema, metricsUsersSchema } from '@kineticrouter/portal-contract';
import { AnalyticsService } from '../apps/bff/src/analytics/service';
import { MemoryAnalyticsStore } from '../apps/bff/src/analytics/memory-store';
import { MetricsService } from '../apps/bff/src/metrics/service';

const now = Date.parse('2026-09-15T12:30:00+05:30');
const services: AnalyticsService[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(services.splice(0).map(service => service.close())); });

function fixture() {
  const analytics = new AnalyticsService({ store: new MemoryAnalyticsStore('Asia/Kolkata'), enabled: true, now: () => now, identify: async () => undefined });
  services.push(analytics);
  const read = async (path: string) => {
    const url = new URL(path, 'https://fixture.test'), params = url.searchParams;
    if (url.pathname === '/settings/public') return { server_timezone: 'Asia/Kolkata' };
    if (url.pathname === '/admin/users') return { page: 1, total: 11, items: Array.from({ length: 11 }, (_, index) => ({ id: index + 1, username: `Customer ${index + 1}`, email: `${index + 1}@example.test`, role: 'user', status: index === 1 ? 'disabled' : 'active' })) };
    if (url.pathname === '/admin/usage') return { items: [{ id: 1, user_id: 1, created_at: '2026-09-15T00:00:00+05:30' }] };
    if (url.pathname === '/admin/dashboard/users-trend') return {
      granularity: params.get('granularity'),
      trend: Array.from({ length: 10 }, (_, index) => ({ date: `2026-09-15${params.get('granularity') === 'hour' ? ' 10:00' : ''}`, user_id: index + 1, requests: index + 1, actual_cost: String(index + 1) })),
    };
    throw new Error(path);
  };
  return { analytics, read, service: new MetricsService(analytics, 'Asia/Kolkata', () => now) };
}

describe('metrics service aggregation and selection', () => {
  it.each([{ startDate: '2026-09-15', endDate: '2026-09-15' }, { range: 'all-time' }])('preserves ranking order across filters, case-insensitive search, and pagination (%j)', async query => {
    const f = fixture();
    const users = async (extra: Record<string, string> = {}) => metricsUsersSchema.parse(await f.service.report('users', { ...query, ...extra } as Record<string, string>, 'admin', f.read));
    const original = await users();
    expect(original.total).toBe(11);
    const light = await users({ cohort: 'light' });
    expect(light.items.map(row => row.id)).toEqual(['1', '2']);
    expect((await users({ search: 'CUSTOMER 10' })).items.map(row => row.id)).toEqual(['10']);
    expect((await users({ cohort: 'none', search: 'EXAMPLE.TEST' })).items.map(row => row.id)).toEqual(['11']);
    const page = await users({ pageSize: '5', page: '2' });
    expect(page.total).toBe(11);
    expect(page.items).toEqual(original.items.slice(5, 10));
    expect(await users()).toEqual(original);
  });

  it('keeps all-time console summaries identical for unordered rows, partial hours, excluded users, and later detail pages', async () => {
    const f = fixture(), startDate = '2026-01-01', endDate = '2026-09-15';
    const items = Array.from({ length: 258 }, (_, day) => {
      const date = new Date(Date.parse(`${startDate}T00:00:00Z`) + day * 86400000).toISOString().slice(0, 10);
      return [1, 2, 999].flatMap(userId => [0, 10, 12, 23].map(hour => ({ userId: String(userId), period: `${date} ${String(hour).padStart(2, '0')}:00`, firstSeen: 0, lastSeen: 0 })));
    }).flat().reverse();
    vi.spyOn(f.analytics.store, 'customerActivity').mockResolvedValue({ availableFrom: '2026-01-01T10:30:00+05:30', retainedFrom: '2025-08-15', items });
    const report = async (query: Record<string, string>) => metricsActivitySchema.parse(await f.service.report('activity', { ...query, source: 'console' }, 'admin', f.read));
    const custom = await report({ startDate, endDate });
    const latest = await report({ range: 'all-time' });
    const older = await report({ range: 'all-time', activityPage: '2' });
    expect(latest.heatmap).toEqual(custom.heatmap);
    expect(latest.usageTrend).toEqual(custom.usageTrend);
    expect(latest.peakUsers).toEqual(custom.peakUsers);
    expect(latest.peakUsers?.users).toBe(2);
    expect(latest.usageTrend.points[0]).toMatchObject({ partial: true, users: 2 });
    expect(latest.usageTrend.points.at(-1)).toMatchObject({ partial: true, users: 2 });
    expect(older.heatmap).toEqual(latest.heatmap);
    expect(older.usageTrend).toEqual(latest.usageTrend);
    expect(older.peakUsers).toEqual(latest.peakUsers);
    expect(older.pagination?.page).toBe(2);
    expect(older.weeks).toEqual(custom.weeks.filter(week => older.weeks.some(row => row.period === week.period)));
  });
});
