import { afterEach, describe, expect, it } from 'vitest';
import { metricsActivitySchema, metricsAveragesSchema, metricsOverviewSchema, metricsPeaksSchema, metricsQuerySchema, metricsUsersSchema } from '@kineticrouter/portal-contract';
import { MetricsService } from '../apps/bff/src/metrics/service';
import { AnalyticsService } from '../apps/bff/src/analytics/service';
import { MemoryAnalyticsStore } from '../apps/bff/src/analytics/memory-store';
import { amount, money } from '../apps/bff/src/metrics/math';

const now = Date.parse('2026-09-15T12:30:00+05:30');
const first = '2024-01-01T10:00:00+05:30';
const services: AnalyticsService[] = [];
afterEach(async () => { await Promise.all(services.splice(0).map(service => service.close())); });
function fixture(options: { clock?: () => number; empty?: boolean; override?: (path: string) => Promise<unknown> | undefined } = {}) {
  const clock = options.clock ?? (() => now), calls: string[] = [];
  const analytics = new AnalyticsService({ store: new MemoryAnalyticsStore(), enabled: true, now: clock, identify: async () => undefined }); services.push(analytics);
  const read = async (path: string): Promise<unknown> => {
    calls.push(path);
    const override = options.override?.(path); if (override !== undefined) return override;
    const url = new URL(path, 'https://fixture.test'), p = url.searchParams;
    if (url.pathname === '/settings/public') return { server_timezone: 'Asia/Kolkata' };
    if (url.pathname === '/admin/users') return { page: 1, total: 3, items: [1, 2, 3].map(id => ({ id, username: `Customer ${id}`, email: `${id}@example.test`, role: 'user', status: id === 2 ? 'disabled' : 'active' })) };
    if (url.pathname === '/admin/usage') return { items: options.empty ? [] : p.has('start_date') ? [{ id: 2, user_id: 999, created_at: '2024-01-01T08:00:00+05:30' }, { id: 3, user_id: 1, created_at: first }] : [{ id: 1, user_id: 999, created_at: '2023-12-25T00:00:00Z' }] };
    if (url.pathname === '/admin/dashboard/users-trend') {
      const points = options.empty ? [] : [
        { date: '2024-01-01', user_id: 1, requests: 1000, actual_cost: '100' },
        { date: '2026-09-15', user_id: 1, requests: 100, actual_cost: '10' },
        { date: '2026-09-15', user_id: 2, requests: 25, actual_cost: '2.5' },
        { date: '2026-09-15', user_id: 999, requests: 9999, actual_cost: '999' },
      ];
      return { granularity: p.get('granularity'), trend: points.filter(row => row.date >= p.get('start_date')! && row.date <= p.get('end_date')!).map(row => ({ ...row, date: row.date + (p.get('granularity') === 'hour' ? ' 10:00' : '') })) };
    }
    throw new Error(path);
  };
  return { analytics, calls, read, service: new MetricsService(analytics, 'Asia/Kolkata', clock) };
}

describe('all-time metrics', () => {
  it('keeps custom date limits while allowing an explicit all-time request without dates', () => {
    expect(metricsQuerySchema.safeParse({ startDate: '2024-01-01', endDate: '2026-09-15' }).success).toBe(false);
    expect(metricsQuerySchema.parse({ range: 'all-time' })).toMatchObject({ range: 'all-time', activityPage: 1 });
    expect(metricsQuerySchema.safeParse({ range: 'all-time', activityPage: '0' }).success).toBe(false);
  });

  it('uses daily chunks for all-time totals/rankings beyond 397 days and finds the first included customer request', async () => {
    const f = fixture();
    const averages = metricsAveragesSchema.parse(await f.service.report('averages', { scope: 'all-time' }, 'admin', f.read));
    const overview = metricsOverviewSchema.parse(await f.service.report('overview', { range: 'all-time' }, 'admin', f.read));
    const users = metricsUsersSchema.parse(await f.service.report('users', { range: 'all-time' }, 'admin', f.read));
    expect(averages).toMatchObject({ scope: 'all-time', totalRequests: 1125, actualCost: '112.5', periodStart: '2024-01-01T04:30:00.000Z' });
    expect(averages.elapsedHours).toBe((now - Date.parse(first)) / 3600000);
    expect(averages.fiveHourly!.requests).toBeCloseTo(averages.hourly!.requests * 5);
    expect(averages.weekly!.requests).toBeCloseTo(averages.hourly!.requests * 168);
    expect(overview).toMatchObject({ totalUsers: 3, requests: 1125, actualCost: '112.5', apiDau: 2, dauDate: '2026-09-15', range: { mode: 'all-time', startDate: '2024-01-01', endDate: '2026-09-15' } });
    expect(users.items.find(row => row.id === '2')).toMatchObject({ status: 'disabled', requests: 25 });
    expect(users.items.find(row => row.id === '3')).toMatchObject({ cohort: 'none' });
    expect(f.calls.filter(path => path.startsWith('admin/dashboard/users-trend')).every(path => new URL(path, 'https://fixture.test').searchParams.get('granularity') === 'day')).toBe(true);
    const today = metricsAveragesSchema.parse(await f.service.report('averages', {}, 'admin', f.read));
    expect(today).toMatchObject({ scope: 'today', totalRequests: 125, hourly: { requests: 10, actualCost: '1' }, fiveHourly: { requests: 50, actualCost: '5' }, weekly: { requests: 1680, actualCost: '168' } });
    const selected = metricsUsersSchema.parse(await f.service.report('users', { startDate: '2026-09-15', endDate: '2026-09-15' }, 'admin', f.read));
    expect(selected.items.find(row => row.id === '1')!.requests).toBe(100);
  });

  it('preserves all-time averages for five minutes and supports manual refresh independently of dates', async () => {
    let clock = now; const f = fixture({ clock: () => clock });
    const firstReport = await f.service.report('averages', { scope: 'all-time' }, 'admin', f.read);
    const calls = f.calls.length;
    clock += 240000;
    expect(await f.service.report('averages', { scope: 'all-time', startDate: '2026-09-15', endDate: '2026-09-15' }, 'admin', f.read)).toEqual(firstReport);
    expect(f.calls.slice(calls).some(path => path.startsWith('admin/dashboard/users-trend'))).toBe(false);
    const refreshed = metricsAveragesSchema.parse(await f.service.report('averages', { scope: 'all-time', refresh: '1' }, 'admin', f.read));
    expect(refreshed.generatedAt).toBe(new Date(clock).toISOString());
    clock = now + 300001;
    expect(metricsAveragesSchema.parse(await f.service.report('averages', { scope: 'all-time' }, 'admin', f.read)).generatedAt).toBe(new Date(clock).toISOString());
  });

  it('pages through all retained weeks while preserving global heatmaps and peaks', async () => {
    const f = fixture();
    const latest = metricsActivitySchema.parse(await f.service.report('activity', { range: 'all-time', source: 'api' }, 'admin', f.read));
    expect(latest.pagination!.totalPages).toBeGreaterThan(4); expect(latest.weeks).toHaveLength(13);
    expect(latest.peakRequests).toMatchObject({ period: '2024-01-01 10:00', requests: 1000 });
    expect(latest.peakUsers).toMatchObject({ period: '2026-09-15 10:00', users: 2 });
    const scanCount = f.calls.length;
    const oldest = metricsActivitySchema.parse(await f.service.report('activity', { range: 'all-time', source: 'api', activityPage: String(latest.pagination!.totalPages) }, 'admin', f.read));
    expect(oldest.weeks[0]!.period).toBe('2024-01-01'); expect(oldest.weeks.length).toBeLessThanOrEqual(13);
    expect(oldest.weeks[0]!).toMatchObject({ requests: 1000, users: 1 });
    expect(oldest.heatmap).toEqual(latest.heatmap); expect(oldest.peakRequests).toEqual(latest.peakRequests); expect(oldest.peakUsers).toEqual(latest.peakUsers);
    expect(oldest.fiveHourPeaks).toEqual(latest.fiveHourPeaks);
    expect(oldest.activeUsage).toEqual(latest.activeUsage);
    expect(latest.activeUsage).toMatchObject({ status: 'ready', activeHours: 2, totalRequests: 1125, actualCost: '112.5', hourly: { requests: 562.5, actualCost: '56.25' }, fiveHourly: { requests: 2812.5, actualCost: '281.25' } });
    expect(oldest.usageTrend).toEqual(latest.usageTrend);
    expect(latest.usageTrend.granularity).toBe('day'); expect(latest.usageTrend.points).toHaveLength(989);
    expect(latest.usageTrend.points[0]).toMatchObject({ period: '2024-01-01', partial: true, requests: 1000, actualCost: '100' });
    expect(latest.usageTrend.points.at(-1)).toMatchObject({ period: '2026-09-15', partial: true, users: 2, requests: 125, actualCost: '12.5' });
    expect(latest.usageTrend.points[1]).toMatchObject({ period: '2024-01-02', covered: true, partial: false, users: 0, requests: 0, actualCost: '0' });
    expect(latest.usageTrend.points.reduce((sum, point) => sum + point.requests, 0)).toBe(1125);
    expect(money(latest.usageTrend.points.reduce((sum, point) => sum + amount(point.actualCost), 0n))).toBe('112.5');
    expect(f.calls.slice(scanCount).filter(path => path.startsWith('admin/dashboard/users-trend')).length).toBeLessThanOrEqual(13);
    const dates = new Set<string>();
    for (let page = 1; page <= latest.pagination!.totalPages; page++) {
      const report = metricsActivitySchema.parse(await f.service.report('activity', { range: 'all-time', activityPage: String(page) }, 'admin', f.read));
      for (const week of report.weeks) { expect(dates.has(week.period)).toBe(false); dates.add(week.period); }
    }
    expect(dates.size).toBe(latest.pagination!.totalWeeks);
  });

  it('uses console retention independently of API history and excludes administrator observations', async () => {
    const f = fixture({ override: path => path.startsWith('admin/usage') || path.startsWith('admin/dashboard') ? Promise.reject(new Error('API offline')) : undefined });
    await f.analytics.store.write([], [{ userId: '1', at: Date.parse(first) }, { userId: '2', at: Date.parse('2026-09-14T10:00:00+05:30') }, { userId: '999', at: Date.parse('2026-09-14T10:00:00+05:30') }]);
    const report = metricsActivitySchema.parse(await f.service.report('activity', { range: 'all-time', source: 'console' }, 'admin', f.read));
    expect(report.range).toEqual({ mode: 'all-time', startDate: '2025-08-15', endDate: '2026-09-15' });
    expect(report.peakUsers).toMatchObject({ users: 1, period: '2026-09-14 10:00' });
    expect(report.usageTrend.points.find(point => point.period === '2026-09-14')).toMatchObject({ users: 1, requests: 0, actualCost: '0' });
    expect(f.calls.some(path => path.startsWith('admin/usage') || path.startsWith('admin/dashboard'))).toBe(false);
  });

  it('shares the full hourly snapshot with peaks and caches all-time peaks for five minutes', async () => {
    let clock = now; const f = fixture({ clock: () => clock });
    const [activity, peaks] = await Promise.all([
      f.service.report('activity', { range: 'all-time' }, 'admin', f.read).then(value => metricsActivitySchema.parse(value)),
      f.service.report('peaks', { scope: 'all-time' }, 'admin', f.read).then(value => metricsPeaksSchema.parse(value)),
    ]);
    expect(peaks.fiveHourPeaks).toEqual(activity.fiveHourPeaks);
    expect(peaks.usageTrend).toEqual(activity.usageTrend);
    expect(peaks.activeUsage).toEqual(activity.activeUsage);
    expect(peaks.fiveHourPeaks.mostRequests).toMatchObject({ requests: 1000, actualCost: '100', startAt: '2024-01-01T04:30:00.000Z' });
    expect(f.calls.filter(path => path.includes('start_date=2024-01-01') && path.includes('granularity=hour'))).toHaveLength(1);
    const count = f.calls.length; clock += 240000;
    expect(await f.service.report('peaks', { scope: 'all-time' }, 'admin', f.read)).toEqual(peaks);
    expect(f.calls.slice(count).some(path => path.startsWith('admin/dashboard'))).toBe(false);
    const refreshed = metricsPeaksSchema.parse(await f.service.report('peaks', { scope: 'all-time', refresh: '1' }, 'admin', f.read));
    expect(refreshed.generatedAt).toBe(new Date(clock).toISOString());
    clock = now + 300001;
    expect(metricsPeaksSchema.parse(await f.service.report('peaks', { scope: 'all-time' }, 'admin', f.read)).generatedAt).toBe(new Date(clock).toISOString());
  });

  it('keeps today peaks independent of selected dates, excludes administrators and includes disabled customers', async () => {
    let clock = now; const f = fixture({ clock: () => clock });
    const peaks = metricsPeaksSchema.parse(await f.service.report('peaks', { startDate: '2024-01-01', endDate: '2024-01-01' }, 'admin', f.read));
    expect(peaks.activeUsage).toMatchObject({ status: 'ready', completedHours: 12, activeHours: 1, totalRequests: 125, actualCost: '12.5', completedThrough: '2026-09-15T06:30:00.000Z', hourly: { requests: 125, actualCost: '12.5' }, fiveHourly: { requests: 625, actualCost: '62.5' } });
    expect(peaks).toMatchObject({ scope: 'today', reportingDate: '2026-09-15', fiveHourPeaks: { status: 'ready', mostRequests: { requests: 125, actualCost: '12.5', startAt: '2026-09-15T00:30:00.000Z', endAt: '2026-09-15T05:30:00.000Z' } } });
    const count = f.calls.length; clock += 59000;
    expect(await f.service.report('peaks', {}, 'admin', f.read)).toEqual(peaks); expect(f.calls).toHaveLength(count);
    clock += 1001;
    expect(metricsPeaksSchema.parse(await f.service.report('peaks', {}, 'admin', f.read)).generatedAt).toBe(new Date(clock).toISOString());
    const unavailable = fixture({ override: path => path.startsWith('admin/dashboard') ? Promise.reject(new Error('Usage unavailable')) : undefined });
    await expect(unavailable.service.report('peaks', {}, 'admin', unavailable.read)).rejects.toThrow('Usage unavailable');
  });

  it.each(['today', 'all-time'] as const)('restarts %s peak scans that cross local midnight', async scope => {
    let clock = Date.parse('2026-09-15T23:59:59+05:30'), crossed = false;
    const f = fixture({ clock: () => clock, override: path => {
      const p = new URL(path, 'https://fixture.test').searchParams;
      if (!crossed && path.startsWith('admin/dashboard') && p.get('granularity') === 'hour') {
        crossed = true; clock += 2000;
        return Promise.resolve({ granularity: 'hour', trend: [] });
      }
      return undefined;
    } });
    const value = metricsPeaksSchema.parse(await f.service.report('peaks', { scope }, 'admin', f.read));
    expect(value.reportingDate).toBe('2026-09-16'); expect(value.generatedAt).toBe(new Date(clock).toISOString());
    if (scope === 'today') expect(value.activeUsage).toMatchObject({ status: 'insufficient-history', completedHours: 0, activeHours: 0, hourly: null, fiveHourly: null });
    if (scope === 'today') expect(value.fiveHourPeaks.status).toBe('insufficient-history');
    expect(f.calls.some(path => path.includes('end_date=2026-09-16') && path.includes('granularity=hour'))).toBe(true);
  });

  it('keeps empty all-time history distinct from an idle day and propagates source errors', async () => {
    const f = fixture({ empty: true });
    expect(await f.service.report('averages', { scope: 'all-time' }, 'admin', f.read)).toMatchObject({ totalRequests: 0, actualCost: '0', periodStart: null, hourly: null, fiveHourly: null, weekly: null });
    const activity = metricsActivitySchema.parse(await f.service.report('activity', { range: 'all-time' }, 'admin', f.read));
    expect(activity.weeks).toEqual([]); expect(activity.pagination!.totalWeeks).toBe(0);
    expect(activity.usageTrend).toEqual({ granularity: 'day', points: [] });
    expect(activity.activeUsage).toMatchObject({ status: 'insufficient-history', completedHours: 0, activeHours: 0, hourly: null, fiveHourly: null });
    const failing = fixture({ override: path => path.startsWith('admin/usage') ? Promise.reject(new Error('History unavailable')) : undefined });
    await expect(failing.service.report('averages', { scope: 'all-time' }, 'admin', failing.read)).rejects.toThrow('History unavailable');
    await expect(failing.service.report('averages', {}, 'admin', failing.read)).resolves.toMatchObject({ totalRequests: 125 });
  });

  it('bounds first-customer verification when upstream ignores the requested page size', async () => {
    const f = fixture({ override: path => path.startsWith('admin/usage') && path.includes('start_date') ? Promise.resolve({ items: Array.from({ length: 1001 }, (_, id) => ({ id: id + 1, user_id: 999, created_at: first })) }) : undefined });
    await expect(f.service.report('averages', { scope: 'all-time' }, 'admin', f.read)).rejects.toMatchObject({ code: 'METRICS_CAPACITY' });
  });

  it('coalesces scans that run longer than the cache TTL and starts their TTL on completion', async () => {
    let clock = now, release!: () => void, started!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; }), acquired = new Promise<void>(resolve => { started = resolve; });
    let held = false;
    const f = fixture({ clock: () => clock, override: path => {
      if (!held && path.startsWith('admin/dashboard/users-trend')) { held = true; started(); return pending.then(() => ({ granularity: 'day', trend: [] })); }
      return undefined;
    } });
    const one = f.service.report('averages', { scope: 'all-time' }, 'admin', f.read);
    await acquired; clock += 360000;
    const two = f.service.report('averages', { scope: 'all-time' }, 'admin', f.read);
    release();
    const [a, b] = await Promise.all([one, two]); expect(a).toEqual(b);
    expect(f.calls.filter(path => path.includes('start_date=2023-12-25') && path.startsWith('admin/dashboard'))).toHaveLength(1);
    const count = f.calls.length;
    clock += 1000; expect(await f.service.report('averages', { scope: 'all-time' }, 'admin', f.read)).toEqual(a);
    expect(f.calls).toHaveLength(count);
  });
  it('shares a long activity scan across pages even after its daily totals cache expires', async () => {
    let clock = now, release!: () => void, started!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; }), acquired = new Promise<void>(resolve => { started = resolve; });
    let held = false;
    const f = fixture({ clock: () => clock, override: path => {
      const p = new URL(path, 'https://fixture.test').searchParams;
      if (!held && path.startsWith('admin/dashboard/users-trend') && p.get('granularity') === 'hour') {
        held = true; started();
        return pending.then(() => ({ granularity: 'hour', trend: [{ date: '2024-01-01 10:00', user_id: 1, requests: 1000, actual_cost: '100' }] }));
      }
      return undefined;
    } });
    const one = f.service.report('activity', { range: 'all-time' }, 'admin', f.read);
    await acquired; clock += 120000;
    const two = f.service.report('activity', { range: 'all-time', activityPage: '2' }, 'admin', f.read);
    release();
    const [latest, older] = (await Promise.all([one, two])).map(value => metricsActivitySchema.parse(value));
    expect(older!.heatmap).toEqual(latest!.heatmap); expect(older!.generatedAt).toBe(latest!.generatedAt);
    expect(f.calls.filter(path => path.startsWith('admin/dashboard') && path.includes('start_date=2023-12-25') && path.includes('granularity=day'))).toHaveLength(1);
    expect(f.calls.filter(path => path.startsWith('admin/dashboard') && path.includes('start_date=2024-01-01') && path.includes('granularity=hour'))).toHaveLength(1);
  });
});
