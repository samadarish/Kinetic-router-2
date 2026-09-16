import { afterEach, describe, expect, it } from 'vitest';
import { mapMetricsCustomers, mapMetricsTrend, mapMetricsUsagePage, Sub2ApiClient } from '@kineticrouter/sub2api-client';
import { metricsActivitySchema, metricsAveragesSchema, metricsUsersSchema, type MetricsCoverage } from '@kineticrouter/portal-contract';
import { rankUsers, amount, money, rate } from '../apps/bff/src/metrics/math';
import { activityReport } from '../apps/bff/src/metrics/activity';
import { localHour, localMidnight, isHourStart, monday } from '../apps/bff/src/metrics/time';
import { MetricsService } from '../apps/bff/src/metrics/service';
import { AnalyticsService } from '../apps/bff/src/analytics/service';
import { MemoryAnalyticsStore } from '../apps/bff/src/analytics/memory-store';

const now = Date.parse('2026-09-14T18:30:00Z');
const coverage: MetricsCoverage = { availableFrom: '2026-09-06T18:30:00Z', through: new Date(now).toISOString(), complete: false, basis: 'retained-api-history', storage: 'upstream', notice: 'Retained history' };
const customer = (id: number, requests: number, actualCost: string) => ({ id: String(id), username: `Customer ${id}`, email: `${id}@example.test`, status: 'active', requests, actualCost });
const services: AnalyticsService[] = [];
afterEach(async () => { await Promise.all(services.splice(0).map(service => service.close())); });
const query = { startDate: '2026-09-07', endDate: '2026-09-14' };
function fixture(read: (path: string) => Promise<unknown>, at: number | (() => number) = now) {
  const clock = typeof at === 'function' ? at : () => at;
  const analytics = new AnalyticsService({ store: new MemoryAnalyticsStore(), enabled: true, now: clock, identify: async () => undefined }); services.push(analytics);
  return { service: new MetricsService(analytics, 'Asia/Kolkata', clock), analytics, read };
}
function upstream(points = [{ date: '2026-07-01', user_id: 1, requests: 100, actual_cost: '10' }, { date: '2026-09-10', user_id: 2, requests: 10, actual_cost: '2' }, { date: '2026-09-10', user_id: 999, requests: 99999, actual_cost: '9999' }]) {
  const calls: string[] = [];
  const read = async (path: string) => {
    calls.push(path); const url = new URL(path, 'https://fixture.test/');
    if (url.pathname === '/settings/public') return { server_timezone: 'Asia/Kolkata' };
    if (url.pathname === '/admin/users') return { items: [1, 2, 3].map(id => ({ ...customer(id, 0, '0'), id, role: 'user', status: id === 2 ? 'disabled' : 'active', notes: 'secret' })), page: 1, total: 3 };
    if (url.pathname === '/admin/usage') return { items: [{ id: 1, user_id: 1, created_at: '2026-07-01T00:00:00+05:30' }] };
    if (url.pathname === '/admin/dashboard/users-trend') {
      const granularity = url.searchParams.get('granularity')!, start = url.searchParams.get('start_date')!, end = url.searchParams.get('end_date')!;
      return { granularity, trend: points.filter(row => row.date >= start && row.date <= end).map(row => ({ ...row, date: row.date + (granularity === 'hour' ? ' 10:00' : '') })) };
    }
    throw new Error(path);
  }; return { calls, read };
}
describe('metrics arithmetic and relative ranking', () => {
  it('gives request and spend ranks equal influence, excludes zero usage, and keeps ties together', () => {
    const rows = rankUsers([customer(1, 100, '1'), customer(2, 1, '100'), customer(3, 50, '50'), customer(4, 0, '0'), customer(5, 1, '1'), customer(6, 100, '100')]);
    expect(rows.find(row => row.id === '1')!.score).toBe(rows.find(row => row.id === '2')!.score);
    expect(rows.find(row => row.id === '6')!.cohort).toBe('heavy'); expect(rows.find(row => row.id === '5')!.cohort).toBe('light');
    expect(rows.find(row => row.id === '4')!.cohort).toBe('none');
    expect(rankUsers([customer(1, 10, '1'), customer(2, 10, '1')]).every(row => row.cohort === 'regular')).toBe(true);
    expect(rankUsers([customer(1, 10, '1')])[0]!.cohort).toBe('regular');
  });
  it('preserves decimal spend and divides by elapsed time including fractional hours', () => {
    expect(money(amount('0.1') + amount('0.2'))).toBe('0.3');
    expect(rate(amount('30'), 1.5 * 3600000)).toBe('20'); expect(rate(amount('30'), 1.5 * 3600000, 5)).toBe('100');
  });
});
describe('metrics time and unique activity', () => {
  it('uses local civil hours, midnight and Monday weeks', () => {
    expect(localHour(Date.parse('2026-09-14T18:45:00Z'), 'Asia/Kolkata')).toBe('2026-09-15 00:00');
    expect(localMidnight('2026-09-15', 'Asia/Kolkata')).toBe('2026-09-14T18:30:00.000Z');
    expect(isHourStart(Date.parse('2026-09-14T18:30:00Z'), 'Asia/Kolkata')).toBe(true);
    expect(monday('2026-09-13')).toBe('2026-09-07'); expect(monday('2026-09-14')).toBe('2026-09-14');
  });
  it('unions users for parent rows and averages heatmap cells across complete idle hours', () => {
    const result = activityReport({ ...query, timezone: 'Asia/Kolkata', now, source: 'api', coverage, rows: [
      { period: '2026-09-07 10:00', userId: '1', requests: 2, actualCost: '0.1' },
      { period: '2026-09-07 11:00', userId: '1', requests: 3, actualCost: '0.2' },
      { period: '2026-09-08 10:00', userId: '1', requests: 1, actualCost: '0.3' },
      { period: '2026-09-08 10:00', userId: '2', requests: 1, actualCost: '0.4' },
    ] });
    expect(metricsActivitySchema.safeParse(result).success).toBe(true);
    expect(result.weeks[0]).toMatchObject({ users: 2, requests: 7, actualCost: '1' });
    expect(result.weeks[0]!.children[0]).toMatchObject({ users: 1, requests: 5, actualCost: '0.3' });
    expect(result.heatmap.find(cell => cell.weekday === 0 && cell.hour === 10)).toMatchObject({ occurrences: 2, users: .5, requests: 1 });
    expect(result.peakUsers).toMatchObject({ period: '2026-09-08 10:00', users: 2 });
    expect(result.peakRequests).toMatchObject({ period: '2026-09-07 11:00', requests: 3 });
    expect(result.usageTrend.granularity).toBe('day');
    expect(result.usageTrend.points[0]).toEqual({ period: '2026-09-07', users: 1, requests: 5, actualCost: '0.3', covered: true, partial: false });
    expect(result.usageTrend.points[1]).toMatchObject({ users: 2, requests: 2, actualCost: '0.7' });
    expect(result.usageTrend.points[2]).toMatchObject({ users: 0, requests: 0, actualCost: '0', covered: true, partial: false });
  });
  it('does not count unavailable rows or partial hours in peaks, and preserves cutoff midnight', () => {
    const report = activityReport({ startDate: '2026-09-07', endDate: '2026-09-08', timezone: 'Asia/Kolkata', now: Date.parse('2026-09-08T05:45:00Z'), source: 'console', coverage: { ...coverage, availableFrom: localMidnight('2026-09-08', 'Asia/Kolkata') }, rows: [
      { period: '2026-09-07 10:00', userId: 'expired', requests: 0, actualCost: '0' },
      { period: '2026-09-08 00:00', userId: 'kept', requests: 0, actualCost: '0' },
      { period: '2026-09-08 11:00', userId: 'current', requests: 0, actualCost: '0' },
    ] });
    expect(report.weeks[0]!.users).toBe(2); expect(report.peakUsers?.period).toBe('2026-09-08 00:00');
    expect(report.weeks[0]!.children[0]!.covered).toBe(false);
    expect(report.weeks[0]!.children[1]!.children[0]).toMatchObject({ covered: true, partial: false, users: 1 });
    expect(report.usageTrend.points[0]).toMatchObject({ covered: false, users: 0 });
    expect(report.usageTrend.points[1]).toMatchObject({ covered: true, partial: true, users: 2, requests: 0, actualCost: '0' });
  });
});
describe('strict upstream metrics projections', () => {
  it('bounds streamed upstream responses without changing ordinary account requests', async () => {
    const client = new Sub2ApiClient('https://account.test', async () => new Response(JSON.stringify({ code: 0, data: { value: 'x'.repeat(2048) } }), { headers: { 'content-type': 'application/json' } }));
    await expect(client.request('admin/users', {}, { maxResponseBytes: 1024 })).rejects.toMatchObject({ code: 'UPSTREAM_RESPONSE_TOO_LARGE' });
    await expect(client.request('admin/users', {}, { maxResponseBytes: 4096 })).resolves.toEqual({ value: 'x'.repeat(2048) });
    await expect(client.request('user/profile')).resolves.toEqual({ value: 'x'.repeat(2048) });
  });
  it('requires actual billed spend and complete response shapes', () => {
    expect(() => mapMetricsTrend({ granularity: 'hour', trend: [{ date: '2026-09-14 10:00', user_id: 1, requests: 2, cost: 99 }] }, 'hour')).toThrow();
    expect(mapMetricsTrend({ granularity: 'hour', trend: [{ date: '2026-09-14 10:00', user_id: 1, requests: 2, actual_cost: 1e-8 }] }, 'hour')[0]!.actualCost).toBe('0.00000001');
    expect(() => mapMetricsTrend({ granularity: 'hour', trend: [{ date: '2026-02-30 10:00', user_id: 1, requests: 2, actual_cost: 0 }] }, 'hour')).toThrow();
    expect(() => mapMetricsCustomers({ total: 1, page: 1, items: [{ ...customer(1, 0, '0'), role: 'admin' }] })).toThrow();
    expect(mapMetricsUsagePage({ items: [{ id: 1, user_id: 1, created_at: '2026-07-01T10:34:56.123456+05:30', api_key_id: 'private' }] })[0]).toEqual({ id: '1', userId: '1', createdAt: '2026-07-01T05:04:56.123Z' });
  });
});
describe('metrics report acquisition', () => {
  it('keeps console reports and today averages available when the API usage-history endpoint fails', async () => {
    const normal = upstream(), f = fixture(async path => path.startsWith('admin/usage') ? Promise.reject(new Error('API history unavailable')) : normal.read(path));
    await expect(f.service.report('activity', { ...query, source: 'console' }, 'admin', f.read)).resolves.toMatchObject({ source: 'console' });
    await expect(f.service.report('averages', {}, 'admin', f.read)).resolves.toMatchObject({ reportingDate: '2026-09-15', totalRequests: 0 });
    expect(normal.calls.some(path => path.startsWith('admin/usage'))).toBe(false);
  });
  it('includes customers beyond the first directory page', async () => {
    const normal = upstream();
    const f = fixture(async path => {
      if (!path.startsWith('admin/users')) return normal.read(path);
      const page = Number(new URL(path, 'https://fixture.test').searchParams.get('page'));
      return { page, total: 1002, items: Array.from({ length: page === 1 ? 1000 : 2 }, (_, index) => ({ ...customer((page - 1) * 1000 + index + 1, 0, '0'), role: 'user' })) };
    });
    const result = metricsUsersSchema.parse(await f.service.report('users', { ...query, page: '41' }, 'admin', f.read));
    expect(result.total).toBe(1002); expect(result.items).toHaveLength(2);
  });
  it('loads only today for averages independently of date filters, includes disabled customers and excludes admins', async () => {
    const upstreamFixture = upstream([
      { date: '2026-09-14', user_id: 1, requests: 900, actual_cost: '90' },
      { date: '2026-09-15', user_id: 1, requests: 100, actual_cost: '10' },
      { date: '2026-09-15', user_id: 2, requests: 25, actual_cost: '2.5' },
      { date: '2026-09-15', user_id: 999, requests: 99999, actual_cost: '9999' },
    ]), f = fixture(upstreamFixture.read, Date.parse('2026-09-15T12:30:00+05:30'));
    const first = metricsAveragesSchema.parse(await f.service.report('averages', { startDate: '2026-09-01', endDate: '2026-09-14' }, 'admin', f.read));
    expect(first).toMatchObject({ totalRequests: 125, actualCost: '12.5', reportingDate: '2026-09-15', periodStart: '2026-09-14T18:30:00.000Z', elapsedHours: 12.5, coverage: { complete: false }, hourly: { requests: 10, actualCost: '1' }, fiveHourly: { requests: 50, actualCost: '5' } });
    const trendCalls = upstreamFixture.calls.filter(path => path.startsWith('admin/dashboard/users-trend'));
    expect(trendCalls).toHaveLength(1);
    expect(new URL(trendCalls[0]!, 'https://fixture.test').searchParams.get('start_date')).toBe('2026-09-15');
    expect(new URL(trendCalls[0]!, 'https://fixture.test').searchParams.get('end_date')).toBe('2026-09-15');
    expect(upstreamFixture.calls.some(path => path.startsWith('admin/usage'))).toBe(false);
    const callCount = upstreamFixture.calls.length;
    const again = await f.service.report('averages', { ...query }, 'admin', f.read);
    expect(again).toEqual(first); expect(upstreamFixture.calls.length).toBe(callCount);
  });
  it('keeps historical customer rankings on their selected reporting dates', async () => {
    const normal = upstream(), f = fixture(normal.read);
    const users = metricsUsersSchema.parse(await f.service.report('users', query, 'admin', f.read));
    expect(users.items).toHaveLength(3); expect(users.items.find(row => row.id === '2')).toMatchObject({ requests: 10, status: 'disabled', actualCost: '2' });
    expect(JSON.stringify(users)).not.toContain('secret');
    expect(users.items.find(row => row.id === '1')).toMatchObject({ requests: 0, cohort: 'none' });
  });
  it('does not silently truncate bulk user trends or accept timezone mismatch', async () => {
    const normal = upstream();
    const f = fixture(async path => path.startsWith('admin/dashboard/users-trend') ? { granularity: 'hour', trend: Array.from({ length: 10001 }, (_, id) => ({ date: '2026-09-07 10:00', user_id: id + 1, requests: 1, actual_cost: 0 })) } : normal.read(path));
    await expect(f.service.report('users', query, 'one', f.read)).rejects.toMatchObject({ code: 'METRICS_CAPACITY' });
    const mismatch = fixture(async path => path === 'settings/public' ? { server_timezone: 'UTC' } : normal.read(path));
    await expect(mismatch.service.report('users', query, 'two', mismatch.read)).rejects.toMatchObject({ code: 'METRICS_TIMEZONE_MISMATCH' });
  });
  it('fails incomplete customer pagination and validates dates before acquiring reports', async () => {
    const normal = upstream(), f = fixture(async path => path.startsWith('admin/users') ? { page: Number(new URL(path, 'https://fixture.test').searchParams.get('page')), total: 2, items: [] } : normal.read(path));
    await expect(f.service.report('users', query, 'one', f.read)).rejects.toMatchObject({ code: 'METRICS_CAPACITY' });
    await expect(f.service.report('users', { startDate: '2026-09-15', endDate: '2026-09-01' }, 'one', f.read)).rejects.toThrow();
  });
  it('returns zero usage and rates on an empty day but null rates exactly at midnight', async () => {
    const normal = upstream([]);
    const midday = fixture(normal.read, Date.parse('2026-09-15T12:30:00+05:30'));
    expect(await midday.service.report('averages', {}, 'admin', midday.read)).toMatchObject({ totalRequests: 0, actualCost: '0', hourly: { requests: 0, actualCost: '0' }, fiveHourly: { requests: 0, actualCost: '0' }, weekly: { requests: 0, actualCost: '0' } });
    const midnight = fixture(normal.read);
    expect(await midnight.service.report('averages', {}, 'admin', midnight.read)).toMatchObject({ totalRequests: 0, actualCost: '0', elapsedHours: 0, hourly: null, fiveHourly: null, weekly: null });
  });
  it('computes five-hour and seven-day spend directly from precise totals before their durations have elapsed', async () => {
    const normal = upstream([{ date: '2026-09-15', user_id: 1, requests: 3, actual_cost: '0.1' }]);
    const f = fixture(normal.read, Date.parse('2026-09-15T03:00:00+05:30'));
    const result = metricsAveragesSchema.parse(await f.service.report('averages', {}, 'admin', f.read));
    expect(result.elapsedHours).toBe(3);
    expect(result.hourly).toEqual({ requests: 1, actualCost: '0.033333333333' });
    expect(result.fiveHourly).toEqual({ requests: 5, actualCost: '0.166666666666' });
    expect(result.weekly).toEqual({ requests: 168, actualCost: '5.6' });
    expect(money(amount(result.hourly!.actualCost) * 5n)).not.toBe(result.fiveHourly!.actualCost);
    expect(money(amount(result.hourly!.actualCost) * 168n)).not.toBe(result.weekly!.actualCost);
  });
  it('rolls today cache over at local midnight within its TTL and refreshes after one minute', async () => {
    let clock = now - 1000;
    const normal = upstream([{ date: '2026-09-14', user_id: 1, requests: 100, actual_cost: '10' }, { date: '2026-09-15', user_id: 1, requests: 2, actual_cost: '0.2' }]);
    const f = fixture(normal.read, () => clock);
    const yesterday = metricsAveragesSchema.parse(await f.service.report('averages', {}, 'admin', f.read));
    expect(yesterday).toMatchObject({ reportingDate: '2026-09-14', totalRequests: 100 });
    clock = now + 1000;
    const today = metricsAveragesSchema.parse(await f.service.report('averages', {}, 'admin', f.read));
    expect(today).toMatchObject({ reportingDate: '2026-09-15', periodStart: '2026-09-14T18:30:00.000Z', totalRequests: 2 });
    expect(today.elapsedHours).toBeCloseTo(1 / 3600);
    expect(normal.calls.filter(path => path.startsWith('admin/dashboard/users-trend'))).toHaveLength(2);
    clock += 60000;
    const refreshed = metricsAveragesSchema.parse(await f.service.report('averages', {}, 'admin', f.read));
    expect(refreshed.elapsedHours).toBeCloseTo(61 / 3600);
    expect(normal.calls.filter(path => path.startsWith('admin/dashboard/users-trend'))).toHaveLength(3);
  });
  it('reports a failed today trend instead of substituting zero usage', async () => {
    const normal = upstream(), f = fixture(async path => path.startsWith('admin/dashboard/users-trend') ? Promise.reject(new Error('Today usage unavailable')) : normal.read(path));
    await expect(f.service.report('averages', {}, 'admin', f.read)).rejects.toThrow('Today usage unavailable');
  });
  it('uses elapsed time when the trend response arrives, including time spent loading usage', async () => {
    let clock = Date.parse('2026-09-15T12:00:00+05:30');
    const normal = upstream([{ date: '2026-09-15', user_id: 1, requests: 125, actual_cost: '12.5' }]);
    const f = fixture(async path => {
      if (path.startsWith('admin/dashboard/users-trend')) clock += 30 * 60000;
      return normal.read(path);
    }, () => clock);
    const report = metricsAveragesSchema.parse(await f.service.report('averages', {}, 'admin', f.read));
    expect(report).toMatchObject({ generatedAt: '2026-09-15T07:00:00.000Z', elapsedHours: 12.5, hourly: { requests: 10, actualCost: '1' }, fiveHourly: { requests: 50, actualCost: '5' } });
  });
  it('reloads the new day when an upstream response arrives after midnight', async () => {
    let clock = now - 1000;
    const normal = upstream([{ date: '2026-09-14', user_id: 1, requests: 100, actual_cost: '10' }, { date: '2026-09-15', user_id: 1, requests: 2, actual_cost: '0.2' }]);
    const f = fixture(async path => {
      if (path.startsWith('admin/dashboard/users-trend')) clock = now + 1000;
      return normal.read(path);
    }, () => clock);
    const report = metricsAveragesSchema.parse(await f.service.report('averages', {}, 'admin', f.read));
    expect(report).toMatchObject({ reportingDate: '2026-09-15', totalRequests: 2, actualCost: '0.2' });
    expect(report.elapsedHours).toBeCloseTo(1 / 3600);
    expect(normal.calls.filter(path => path.startsWith('admin/dashboard/users-trend'))).toHaveLength(2);
  });
});
