import { metricsAveragesQuerySchema, metricsPeaksQuerySchema, metricsQuerySchema, type MetricsActivity, type MetricsAverages, type MetricsCoverage, type MetricsOverview, type MetricsPeaks, type MetricsQuery, type MetricsUsers } from '@kineticrouter/portal-contract';
import { mapMetricsCustomers, mapMetricsTimezone, mapMetricsTrend, mapMetricsUsagePage, MetricsSourceError, type CustomerUsagePoint, type MetricsCustomer } from '@kineticrouter/sub2api-client';
import type { AnalyticsService } from '../analytics/service.js';
import { analyticsDay, retentionDay } from '../analytics/model.js';
import { activityReport, pagedActivity } from './activity.js';
import { amount, money, rankUsers, rate } from './math.js';
import { addDays, chunks, localMidnight } from './time.js';

type Read = (path: string) => Promise<unknown>;
type Context = { timezone: string; customers: MetricsCustomer[] };
type DatedQuery = MetricsQuery & { startDate: string; endDate: string };
export class MetricsError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
const url = (path: string, values: Record<string, string | number | boolean>) => `${path}?${new URLSearchParams(Object.entries(values).map(([key, value]) => [key, String(value)]))}`;
const CAP = 10001;

function customerPage(users: MetricsUsers['items'], query: MetricsQuery) {
  const search = query.search.toLowerCase();
  let rows = query.cohort === 'all' && !search ? users : users.filter(row =>
    (query.cohort === 'all' || row.cohort === query.cohort) && (!search || `${row.username} ${row.email}`.toLowerCase().includes(search)));
  // Cohort filtering creates a private array; never reorder the shared ranking.
  if (query.cohort === 'light') rows.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  return { items: rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), total: rows.length, page: query.page, pageSize: query.pageSize };
}

export class MetricsService {
  private cache = new Map<string, { until: number; value: Promise<unknown>; bytes: number; pending: boolean }>();
  private active = 0;
  private waiting: Array<() => void> = [];
  constructor(private readonly analytics: AnalyticsService, private readonly timezone: string, private readonly now: () => number = Date.now) {}
  private async limited<T>(run: () => Promise<T>): Promise<T> {
    if (this.active >= 2) { if (this.waiting.length >= 100) throw new MetricsError('METRICS_BUSY', 'Metrics is busy. Try again shortly.'); await new Promise<void>(resolve => this.waiting.push(resolve)); }
    else this.active++;
    try { return await run(); } finally { const next = this.waiting.shift(); if (next) next(); else this.active--; }
  }
  private cached<T>(key: string, ttl: number, run: () => Promise<T>): Promise<T> {
    for (const [expiredKey, entry] of this.cache) if (!entry.pending && entry.until <= this.now()) this.cache.delete(expiredKey);
    const old = this.cache.get(key); if (old && (old.pending || old.until > this.now())) return old.value as Promise<T>;
    if (this.cache.size >= 30) {
      const settled = [...this.cache.entries()].find(([, entry]) => !entry.pending);
      if (settled) this.cache.delete(settled[0]);
      else throw new MetricsError('METRICS_BUSY', 'Metrics is busy. Try again shortly.');
    }
    const value = run().then(result => {
      const entry = this.cache.get(key);
      if (entry?.value === value) {
        entry.pending = false; entry.until = this.now() + ttl;
        entry.bytes = JSON.stringify(result).length * 2;
        let total = [...this.cache.values()].reduce((sum, item) => sum + item.bytes, 0);
        for (const [evictKey, item] of this.cache) { if (total <= 32 * 1024 * 1024) break; if (!item.pending) { total -= item.bytes; this.cache.delete(evictKey); } }
      } return result;
    }).catch(error => { if (this.cache.get(key)?.value === value) this.cache.delete(key); throw error; });
    this.cache.set(key, { until: Infinity, value, bytes: 0, pending: true }); return value;
  }
  private context(scope: string, read: Read) {
    return this.cached(`${scope}:context`, 60000, async (): Promise<Context> => {
      const timezone = mapMetricsTimezone(await this.limited(() => read('settings/public')));
      if (timezone !== new Intl.DateTimeFormat('en', { timeZone: this.timezone }).resolvedOptions().timeZone) throw new MetricsError('METRICS_TIMEZONE_MISMATCH', 'Metrics requires the console and account service to use the same reporting timezone.');
      const customers: MetricsCustomer[] = []; let total = 0;
      for (let page = 1; ; page++) {
        const data = mapMetricsCustomers(await this.limited(() => read(url('admin/users', { page, page_size: 1000, role: 'user', include_subscriptions: false, sort_by: 'id', sort_order: 'asc' }))));
        if (data.page !== page || (page > 1 && total !== data.total)) throw new MetricsError('METRICS_DIRECTORY_CHANGED', 'Customer accounts changed while loading. Refresh metrics.');
        total = data.total; customers.push(...data.items);
        if (total > 10000 || customers.length > total || (!data.items.length && customers.length < total)) throw new MetricsError('METRICS_CAPACITY', 'The complete customer directory could not be loaded.');
        if (customers.length === total) break;
      }
      if (new Set(customers.map(row => row.id)).size !== total) throw new MetricsSourceError();
      return { timezone, customers };
    });
  }
  private firstAvailable(scope: string, read: Read): Promise<string | null> {
    return this.cached(`${scope}:first-usage`, 60000, async () => {
      const rows = mapMetricsUsagePage(await this.limited(() => read(url('admin/usage', { page: 1, page_size: 1, sort_by: 'created_at', sort_order: 'asc' }))));
      return rows[0]?.createdAt ?? null;
    });
  }
  private async scanTrend(startDate: string, endDate: string, granularity: 'hour' | 'day', read: Read, consume: (rows: CustomerUsagePoint[], start: string, end: string) => void) {
    const days = (Date.parse(endDate) - Date.parse(startDate)) / 86400000 + 1;
    if (days < 1 || days > 2000 * (granularity === 'hour' ? 7 : 28)) throw new MetricsError('METRICS_CAPACITY', 'This history exceeds the reporting limit. Choose a shorter range.');
    const ranges = granularity === 'hour' ? chunks(startDate, endDate, 7) : this.months(startDate, endDate);
    if (ranges.length > 2000) throw new MetricsError('METRICS_CAPACITY', 'This history exceeds the reporting limit. Choose a shorter range.');
    let index = 0, count = 0, failed = false;
    const worker = async () => {
      try { while (!failed && index < ranges.length) {
        const range = ranges[index++]!;
        const rows = mapMetricsTrend(await this.limited(() => read(url('admin/dashboard/users-trend', { start_date: range.startDate, end_date: range.endDate, granularity, limit: CAP }))), granularity);
        count += rows.length;
        const identities = new Set<string>();
        for (const row of rows) identities.add(row.userId);
        if (identities.size >= CAP || count > 250000) throw new MetricsError('METRICS_CAPACITY', 'This report exceeds the complete-history reporting limit. Choose a shorter range.');
        const keys = new Set<string>();
        for (const row of rows) { const key = `${row.period}:${row.userId}`;
          if (row.period.slice(0, 10) < range.startDate || row.period.slice(0, 10) > range.endDate || keys.has(key)) throw new MetricsSourceError(); keys.add(key);
        }
        consume(rows, range.startDate, range.endDate);
      } } catch (error) { failed = true; throw error; }
    };
    await Promise.all([worker(), worker()]);
  }
  private months(start: string, end: string) {
    const ranges: Array<{ startDate: string; endDate: string }> = [];
    for (let day = start; day <= end;) {
      const date = new Date(day), last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
      const finish = last < end ? last : end; ranges.push({ startDate: day, endDate: finish }); day = addDays(finish, 1);
    } return ranges;
  }
  private coverage(firstAvailable: string | null, now: number): MetricsCoverage {
    return { availableFrom: firstAvailable, through: new Date(now).toISOString(), complete: false, basis: 'retained-api-history', storage: 'upstream', notice: 'Based on retained API usage. Earlier or deleted usage cannot be reconstructed; recorded requests include zero-cost requests.' };
  }
  private base(scope: string, query: DatedQuery, read: Read) {
    return this.cached(`${scope}:range:${query.startDate}:${query.endDate}`, 60000, async () => {
      const context = await this.context(scope, read), firstAvailable = await this.firstAvailable(scope, read), now = this.now();
      if (query.endDate > analyticsDay(now, context.timezone)) throw new MetricsError('METRICS_RANGE_INVALID', 'The reporting range cannot end in the future.');
      if (firstAvailable && query.endDate < analyticsDay(Date.parse(firstAvailable), context.timezone)) throw new MetricsError('METRICS_HISTORY_UNAVAILABLE', 'No retained API history is available for these dates. Choose a later reporting period.');
      const start = firstAvailable ? [query.startDate, analyticsDay(Date.parse(firstAvailable), context.timezone)].sort()[1]! : query.endDate;
      const customerIds = new Set(context.customers.map(row => row.id));
      const rows: CustomerUsagePoint[] = [];
      if (firstAvailable && start <= query.endDate) await this.scanTrend(start, query.endDate, 'hour', read, points => {
        for (const point of points) if (customerIds.has(point.userId)) rows.push(point);
      });
      const totals = new Map<string, { requests: number; cost: bigint }>();
      for (const row of rows) { const total = totals.get(row.userId) ?? { requests: 0, cost: 0n }; total.requests += row.requests; total.cost += amount(row.actualCost); if (!Number.isSafeInteger(total.requests)) throw new MetricsSourceError(); totals.set(row.userId, total); }
      const users = rankUsers(context.customers.map(customer => ({ ...customer, requests: totals.get(customer.id)?.requests ?? 0, actualCost: money(totals.get(customer.id)?.cost ?? 0n) })));
      return { context, rows, users, coverage: this.coverage(firstAvailable, now), now };
    });
  }
  private async consoleActivity(context: Context, query: DatedQuery): Promise<MetricsActivity> {
    if (!this.analytics.enabled) throw new MetricsError('METRICS_CONSOLE_DISABLED', 'Console activity collection is disabled. API reports remain available.');
    const now = this.now(), history = await this.analytics.store.customerActivity(query.startDate, query.endDate, now);
    const customers = new Set(context.customers.map(row => row.id));
    const availableFrom = history.availableFrom && analyticsDay(Date.parse(history.availableFrom), context.timezone) < history.retainedFrom ? localMidnight(history.retainedFrom, context.timezone) : history.availableFrom;
    const coverage: MetricsCoverage = { availableFrom, through: new Date(now).toISOString(), complete: false, basis: 'console-observations', storage: this.analytics.store.kind, notice: 'Observed signed-in customers on visible console pages. Collection is best effort; history starts when tracking was enabled and is retained for thirteen months.' };
    const rows = history.items.filter(row => customers.has(row.userId)).map(row => ({ period: row.period, userId: row.userId, requests: 0, actualCost: '0' }));
    if (query.range === 'all-time') {
      const startDate = availableFrom ? analyticsDay(Date.parse(availableFrom), context.timezone) : query.endDate;
      const result = pagedActivity({ startDate, endDate: query.endDate, source: 'console', timezone: context.timezone, now, coverage, page: query.activityPage });
      // Index once instead of scanning the entire retained history for every week.
      const byDay = new Map<string, CustomerUsagePoint[]>();
      for (const row of rows) {
        const day = row.period.slice(0, 10), group = byDay.get(day);
        if (group) group.push(row); else byDay.set(day, [row]);
      }
      for (const chunk of chunks(startDate, query.endDate, 7)) {
        const points: CustomerUsagePoint[] = [];
        for (let day = chunk.startDate; day <= chunk.endDate; day = addDays(day, 1)) {
          for (const row of byDay.get(day) ?? []) points.push(row);
        }
        result.add(chunk.startDate, chunk.endDate, points);
      }
      return result.finish();
    }
    return activityReport({ ...query, source: 'console', timezone: context.timezone, now, coverage, rows });
  }
  async report(kind: 'overview' | 'users' | 'activity' | 'averages' | 'peaks', input: Record<string, string>, sessionId: string, read: Read): Promise<MetricsOverview | MetricsUsers | MetricsActivity | MetricsAverages | MetricsPeaks> {
    const refresh = /^\d{1,16}$/.test(input.refresh ?? '') ? input.refresh : '0';
    const scope = `${sessionId}:${refresh}`;
    if (kind === 'averages') return this.averages(scope, read, metricsAveragesQuerySchema.parse(input).scope);
    if (kind === 'peaks') return this.peaks(scope, read, metricsPeaksQuerySchema.parse(input).scope);
    const parsed = metricsQuerySchema.parse(input);
    if (parsed.range === 'all-time') return this.allTimeReport(kind, scope, parsed, read);
    const query = parsed as DatedQuery;
    if (kind === 'activity' && query.source === 'console') {
      const context = await this.context(scope, read);
      if (query.endDate > analyticsDay(this.now(), context.timezone)) throw new MetricsError('METRICS_RANGE_INVALID', 'The reporting range cannot end in the future.');
      return this.cached(`${scope}:console:${query.startDate}:${query.endDate}`, 60000, () => this.consoleActivity(context, query));
    }
    const base = await this.base(scope, query, read);
    const meta = { generatedAt: new Date(base.now).toISOString(), timezone: base.context.timezone, coverage: base.coverage, range: { mode: 'custom' as const, startDate: query.startDate, endDate: query.endDate } };
    if (kind === 'users') return { ...meta, ...customerPage(base.users, query) };
    const apiActivity = activityReport({ ...query, source: 'api', timezone: base.context.timezone, now: base.now, coverage: base.coverage, rows: base.rows });
    if (kind === 'activity') return apiActivity;
    let consoleDau: number | null = null, consoleNotice: string | null = null;
    try { const consoleReport = await this.consoleActivity(base.context, { ...query, startDate: query.endDate }); const day = consoleReport.weeks.flatMap(week => week.children).find(day => day.period === query.endDate); consoleDau = day?.covered ? day.users : null; if (consoleDau === null) consoleNotice = 'Console activity is unavailable for this date.'; }
    catch { consoleNotice = 'Console activity is unavailable. API metrics are unaffected.'; }
    const apiDay = apiActivity.weeks.flatMap(week => week.children).find(day => day.period === query.endDate);
    return { ...meta, totalUsers: base.users.length, requests: base.users.reduce((sum, row) => sum + row.requests, 0), actualCost: money(base.users.reduce((sum, row) => sum + amount(row.actualCost), 0n)), apiDau: apiDay?.covered ? apiDay.users : null, consoleDau, dauDate: query.endDate,
      heavyUsers: base.users.filter(row => row.cohort === 'heavy').length, lightUsers: base.users.filter(row => row.cohort === 'light').length, noUsageUsers: base.users.filter(row => row.cohort === 'none').length, consoleNotice };
  }
  private async peaks(scope: string, read: Read, peakScope: MetricsPeaks['scope']): Promise<MetricsPeaks> {
    const context = await this.context(scope, read), reportingDate = analyticsDay(this.now(), context.timezone);
    return this.cached(`${scope}:peaks:${peakScope}:${context.timezone}:${reportingDate}`, peakScope === 'today' ? 60000 : 300000, async () => {
      let report: MetricsActivity;
      if (peakScope === 'all-time') {
        report = await this.allTimeApiActivity(scope, metricsQuerySchema.parse({ range: 'all-time' }), read);
      } else {
        const query = metricsQuerySchema.parse({ startDate: reportingDate, endDate: reportingDate }) as DatedQuery;
        const base = await this.base(scope, query, read);
        report = activityReport({ ...query, source: 'api', timezone: context.timezone, now: base.now, coverage: base.coverage, rows: base.rows });
      }
      if (analyticsDay(this.now(), context.timezone) !== reportingDate) return this.peaks(scope, read, peakScope);
      return { scope: peakScope, reportingDate: analyticsDay(Date.parse(report.generatedAt), report.timezone), generatedAt: report.generatedAt, timezone: report.timezone, coverage: report.coverage, fiveHourPeaks: report.fiveHourPeaks!, activeUsage: report.activeUsage!, usageTrend: report.usageTrend };
    });
  }
  private async averages(scope: string, read: Read, averageScope: 'today' | 'all-time' = 'today'): Promise<MetricsAverages> {
    const context = await this.context(scope, read), reportingDate = analyticsDay(this.now(), context.timezone);
    return this.cached(`${scope}:averages:${averageScope}:${context.timezone}:${reportingDate}`, averageScope === 'today' ? 60000 : 300000, async () => {
      if (averageScope === 'all-time') {
        const history = await this.allTimeBase(scope, read);
        return this.averageValues('all-time', context, history.now, history.periodStart, history.totalRequests, amount(history.actualCost), history.coverage);
      }
      const customerIds = new Set(context.customers.map(row => row.id));
      let totalRequests = 0, cost = 0n;
      await this.scanTrend(reportingDate, reportingDate, 'day', read, rows => {
        for (const row of rows) if (customerIds.has(row.userId)) { totalRequests += row.requests; cost += amount(row.actualCost); }
      });
      const now = this.now();
      if (analyticsDay(now, context.timezone) !== reportingDate) return this.averages(scope, read, averageScope);
      const periodStart = localMidnight(reportingDate, context.timezone);
      if (!Number.isSafeInteger(totalRequests)) throw new MetricsSourceError();
      return this.averageValues('today', context, now, periodStart, totalRequests, cost, { ...this.coverage(periodStart, now), notice: 'Based on retained customer API usage today, including zero-cost requests. Deleted usage may be missing.' });
    });
  }
  private averageValues(scope: MetricsAverages['scope'], context: Context, now: number, periodStart: string | null, totalRequests: number, cost: bigint, coverage: MetricsCoverage): MetricsAverages {
    const elapsedMs = periodStart ? Math.max(0, now - Date.parse(periodStart)) : 0;
    const average = (hours: number) => elapsedMs ? { requests: totalRequests / (elapsedMs / (hours * 3600000)), actualCost: rate(cost, elapsedMs, hours) } : null;
    return { scope, generatedAt: new Date(now).toISOString(), timezone: context.timezone, coverage, reportingDate: analyticsDay(now, context.timezone), periodStart, elapsedHours: elapsedMs / 3600000, totalRequests, actualCost: money(cost), hourly: average(1), fiveHourly: average(5), weekly: average(168) };
  }

  private async allTimeBase(scope: string, read: Read): Promise<{ context: Context; users: MetricsUsers['items']; periodStart: string | null; startDate: string; endDate: string; now: number; coverage: MetricsCoverage; totalRequests: number; actualCost: string; apiDau: number }> {
    const context = await this.context(scope, read), endDate = analyticsDay(this.now(), context.timezone);
    return this.cached(`${scope}:all-history:${context.timezone}:${endDate}`, 60000, async () => {
      const firstAvailable = await this.firstAvailable(scope, read), ids = new Set(context.customers.map(row => row.id));
      const totals = new Map<string, { requests: number; cost: bigint }>(), todayUsers = new Set<string>();
      let firstDay: string | null = null, totalRequests = 0, cost = 0n;
      if (firstAvailable) await this.scanTrend(analyticsDay(Date.parse(firstAvailable), context.timezone), endDate, 'day', read, rows => {
        for (const row of rows) if (ids.has(row.userId)) {
          const value = amount(row.actualCost), total = totals.get(row.userId) ?? { requests: 0, cost: 0n };
          total.requests += row.requests; total.cost += value; totalRequests += row.requests; cost += value;
          if (!Number.isSafeInteger(totalRequests)) throw new MetricsSourceError();
          totals.set(row.userId, total);
          if ((row.requests > 0 || value > 0n) && (!firstDay || row.period < firstDay)) firstDay = row.period;
          if (row.period === endDate && row.requests > 0) todayUsers.add(row.userId);
        }
      });
      let periodStart: string | null = null;
      if (firstDay) {
        const seen = new Set<string>(); let previousAt = '';
        for (let page = 1; page <= 250 && !periodStart; page++) {
          const events = mapMetricsUsagePage(await this.limited(() => read(url('admin/usage', { page, page_size: 1000, start_date: firstDay!, end_date: firstDay!, sort_by: 'created_at', sort_order: 'asc' }))));
          if (events.length > 1000) throw new MetricsError('METRICS_CAPACITY', 'The first customer request could not be verified within the reporting limit.');
          for (const event of events) {
            if (seen.has(event.id) || analyticsDay(Date.parse(event.createdAt), context.timezone) !== firstDay || event.createdAt < previousAt) throw new MetricsSourceError();
            seen.add(event.id); previousAt = event.createdAt;
            if (ids.has(event.userId)) { periodStart = event.createdAt; break; }
          }
          if (!events.length) break;
        }
        if (!periodStart) throw new MetricsError('METRICS_HISTORY_CHANGED', 'The first customer request could not be verified. Refresh metrics.');
      }
      const now = this.now();
      if (analyticsDay(now, context.timezone) !== endDate) return this.allTimeBase(scope, read);
      if (periodStart && Date.parse(periodStart) > now) throw new MetricsSourceError();
      const users = rankUsers(context.customers.map(customer => ({ ...customer, requests: totals.get(customer.id)?.requests ?? 0, actualCost: money(totals.get(customer.id)?.cost ?? 0n) })));
      return { context, users, periodStart, startDate: firstDay ?? endDate, endDate, now, coverage: this.coverage(periodStart, now), totalRequests, actualCost: money(cost), apiDau: todayUsers.size };
    });
  }

  private async allTimeReport(kind: 'overview' | 'users' | 'activity', scope: string, query: MetricsQuery, read: Read): Promise<MetricsOverview | MetricsUsers | MetricsActivity> {
    if (kind === 'activity' && query.source === 'console') {
      const context = await this.context(scope, read), endDate = analyticsDay(this.now(), context.timezone);
      return this.cached(`${scope}:console:all-time:${endDate}:${query.activityPage}`, 60000, () => this.consoleActivity(context, { ...query, startDate: retentionDay(this.now(), context.timezone), endDate }));
    }
    if (kind === 'activity') return this.allTimeApiActivity(scope, query, read);
    const history = await this.allTimeBase(scope, read);
    const meta = { generatedAt: new Date(history.now).toISOString(), timezone: history.context.timezone, coverage: history.coverage, range: { mode: 'all-time' as const, startDate: history.periodStart ? history.startDate : null, endDate: history.endDate } };
    if (kind === 'users') return { ...meta, ...customerPage(history.users, query) };
    let consoleDau: number | null = null, consoleNotice: string | null = null;
    try {
      const report = await this.consoleActivity(history.context, { ...query, range: 'custom', startDate: history.endDate, endDate: history.endDate });
      const day = report.weeks.flatMap(week => week.children).find(day => day.period === history.endDate);
      consoleDau = day?.covered ? day.users : null;
      if (consoleDau === null) consoleNotice = 'Console activity is unavailable for this date.';
    } catch { consoleNotice = 'Console activity is unavailable. API metrics are unaffected.'; }
    return { ...meta, totalUsers: history.users.length, requests: history.totalRequests, actualCost: history.actualCost, apiDau: history.apiDau, consoleDau, consoleNotice, dauDate: history.endDate, heavyUsers: history.users.filter(row => row.cohort === 'heavy').length, lightUsers: history.users.filter(row => row.cohort === 'light').length, noUsageUsers: history.users.filter(row => row.cohort === 'none').length };
  }

  private async allTimeApiActivity(scope: string, query: MetricsQuery, read: Read): Promise<MetricsActivity> {
    const endDate = analyticsDay(this.now(), this.timezone);
    const snapshot = await this.cached(`${scope}:api:all-time:${endDate}`, 60000, async () => {
      const history = await this.allTimeBase(scope, read);
      const ids = new Set(history.context.customers.map(row => row.id));
      const input = { startDate: history.startDate, endDate: history.endDate, source: 'api' as const, timezone: history.context.timezone, now: history.now, coverage: history.coverage };
      const result = pagedActivity({ ...input, page: 1 });
      if (history.periodStart) await this.scanTrend(history.startDate, history.endDate, 'hour', read, (rows, start, end) => result.add(start, end, rows.filter(row => ids.has(row.userId))));
      return { report: result.finish(), input, customerIds: [...ids] };
    });
    const summary = snapshot.report;
    if (query.activityPage === 1 || summary.pagination!.totalPages === 1) return summary;
    return this.cached(`${scope}:api:all-time:${summary.generatedAt}:page:${query.activityPage}`, 60000, async () => {
      const result = pagedActivity({ ...snapshot.input, page: query.activityPage }), ids = new Set(snapshot.customerIds);
      await this.scanTrend(result.detailRange.startDate, result.detailRange.endDate, 'hour', read, (rows, start, end) => result.add(start, end, rows.filter(row => ids.has(row.userId))));
      return { ...result.finish(), heatmap: summary.heatmap, peakUsers: summary.peakUsers, peakRequests: summary.peakRequests, fiveHourPeaks: summary.fiveHourPeaks, activeUsage: summary.activeUsage, usageTrend: summary.usageTrend };
    });
  }
}
