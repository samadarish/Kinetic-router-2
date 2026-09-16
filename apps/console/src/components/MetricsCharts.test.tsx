import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MetricsOverview, MetricsUsageTrend } from '@kineticrouter/portal-contract';
import { CustomerMix, ExactMoney, MetricsTrend, TrendDataTable, customerMix, metricsChartPoints, metricsPeriodLabel, summaryMoney } from './MetricsCharts';

const trend: MetricsUsageTrend = { granularity: 'hour', points: [
  { period: '2026-09-14 00:00', requests: 0, users: 0, actualCost: '0', covered: false, partial: false },
  { period: '2026-09-14 01:00', requests: 0, users: 0, actualCost: '0', covered: true, partial: false },
  { period: '2026-09-14 02:00', requests: 3, users: 2, actualCost: '0.000000000001', covered: true, partial: true },
] };
describe('Metrics charts and precise values', () => {
  it('renders only the newest 100 history entries without copying or reformatting the full history', () => {
    const points = Array.from({ length: 1000 }, (_, index) => ({
      period: new Date(Date.UTC(2023, 0, 1 + index)).toISOString().slice(0, 10),
      requests: index, users: index, actualCost: String(index), covered: true, partial: false,
    }));
    let reads = 0;
    const history = new Proxy(points, { get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
      return Reflect.get(target, key, receiver);
    } });
    const numberFormats = vi.spyOn(Intl, 'NumberFormat'), dateFormats = vi.spyOn(Intl, 'DateTimeFormat');
    try {
      const html = renderToStaticMarkup(<TrendDataTable trend={{ granularity: 'day', points: history }} allowUsers />);
      expect(html.match(/<tr>/g)).toHaveLength(101);
      expect(html).toContain('Page 1 of 10');
      expect(html.indexOf(metricsPeriodLabel(points[999]!.period))).toBeLessThan(html.indexOf(metricsPeriodLabel(points[900]!.period)));
      expect(html).not.toContain(metricsPeriodLabel(points[899]!.period));
      expect(reads).toBe(100);
      expect(numberFormats).not.toHaveBeenCalled();
      expect(dateFormats).not.toHaveBeenCalled();
      expect(points[0]!.period).toBe('2023-01-01');
    } finally {
      numberFormats.mockRestore(); dateFormats.mockRestore();
    }
  });
  it('distinguishes unavailable gaps from idle zeroes and retains exact partial values', () => {
    expect(metricsChartPoints(trend, 'requests').map(point => point.value)).toEqual([null, 0, 3]);
    expect(metricsChartPoints(trend, 'actualCost')[2]).toMatchObject({ value: 1e-12, actualCost: '0.000000000001', partial: true });
    const table = renderToStaticMarkup(<TrendDataTable trend={trend} allowUsers />);
    expect(table).toContain('Unavailable'); expect(table).toContain('Partial period'); expect(table).toContain('Complete'); expect(table).toContain('$0.000000000001');
    const consoleTable = renderToStaticMarkup(<TrendDataTable trend={trend} allowUsers usersOnly />);
    expect(consoleTable).toContain('Active customers'); expect(consoleTable).not.toContain('Requests'); expect(consoleTable).not.toContain('Billed spend');
    const html = renderToStaticMarkup(<MetricsTrend trend={trend} timezone="Asia/Kolkata" metric="requests" />);
    expect(html).toContain('Asia/Kolkata'); expect(html).toContain('View chart data'); expect(html).toContain('Amber points are partial periods');
    expect(metricsPeriodLabel('2026-09-14 00:00')).toBe('Sep 14, 2026 · 12:00 AM');
  });
  it('keeps tiny nonzero amounts visible and exact amounts available to keyboard and touch users', () => {
    expect(summaryMoney('0')).toBe('$0.00'); expect(summaryMoney('0.000000000001')).toBe('<$0.01'); expect(summaryMoney('799.0302')).toBe('$799.03');
    const html = renderToStaticMarkup(<ExactMoney value="799.0302" />);
    expect(html).toContain('type="button"'); expect(html).toContain('aria-expanded="false"'); expect(html).toContain('role="tooltip"'); expect(html).toContain('Exact amount: $799.0302');
  });
  it('builds all four classifications from full overview totals, including regular and no usage', () => {
    const data: MetricsOverview = { generatedAt: '2026-09-14T12:00:00Z', timezone: 'UTC', coverage: { availableFrom: null, through: '2026-09-14T12:00:00Z', complete: false, basis: 'retained-api-history', storage: 'upstream', notice: 'Retained' }, range: { mode: 'custom', startDate: '2026-09-01', endDate: '2026-09-14' }, totalUsers: 20, heavyUsers: 3, lightUsers: 3, noUsageUsers: 10, requests: 200, actualCost: '20', apiDau: 2, consoleDau: 1, dauDate: '2026-09-14', consoleNotice: null };
    expect(customerMix(data).map(row => [row.label, row.value])).toEqual([['Heavy', 3], ['Regular', 4], ['Light', 3], ['No usage', 10]]);
    const html = renderToStaticMarkup(<CustomerMix data={data} />);
    expect(html).toContain('Customer mix'); expect(html).toContain('15%'); expect(html).toContain('20%'); expect(html).toContain('50%');
    expect(renderToStaticMarkup(<CustomerMix data={{ ...data, totalUsers: 0, heavyUsers: 0, lightUsers: 0, noUsageUsers: 0 }} />)).toContain('No customer accounts are available');
  });
});
