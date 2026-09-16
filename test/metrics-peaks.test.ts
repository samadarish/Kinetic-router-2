import { describe, expect, it } from 'vitest';
import type { MetricsCoverage } from '@kineticrouter/portal-contract';
import type { CustomerUsagePoint } from '@kineticrouter/sub2api-client';
import { activityReport, pagedActivity } from '../apps/bff/src/metrics/activity';
import { fiveHourPeaks } from '../apps/bff/src/metrics/peaks';
import { chunks } from '../apps/bff/src/metrics/time';

const coverage: MetricsCoverage = { availableFrom: '2026-09-14T00:00:00Z', through: '2026-09-14T18:00:00Z', complete: false, basis: 'retained-api-history', storage: 'upstream', notice: 'Retained usage' };
const input = { startDate: '2026-09-14', endDate: '2026-09-14', source: 'api' as const, timezone: 'UTC', now: Date.parse(coverage.through), coverage };
const point = (period: string, requests: number, actualCost = '0', userId = '1'): CustomerUsagePoint => ({ period, requests, actualCost, userId });
const report = (rows: CustomerUsagePoint[], overrides: Partial<typeof input> = {}) => activityReport({ ...input, ...overrides, rows });

describe('combined busiest five-hour usage', () => {
  it('combines customers and chooses distinct request/spend winners using exact costs and earliest ties', () => {
    const result = report([
      point('2026-09-14 00:00', 3, '0.1'), point('2026-09-14 01:00', 7, '0.2', '2'), point('2026-09-14 01:00', 5, '0.000000000001', '3'),
      point('2026-09-14 10:00', 1, '1.000000000001'), point('2026-09-14 11:00', 1, '2.000000000002'),
    ]).fiveHourPeaks!;
    expect(result).toEqual({ status: 'ready', eligibleWindows: 14,
      mostRequests: { startAt: '2026-09-14T00:00:00.000Z', endAt: '2026-09-14T05:00:00.000Z', requests: 15, actualCost: '0.300000000001' },
      highestSpend: { startAt: '2026-09-14T07:00:00.000Z', endAt: '2026-09-14T12:00:00.000Z', requests: 2, actualCost: '3.000000000003' },
    });
  });

  it('distinguishes zero-cost requests, idle history and unavailable history', () => {
    const free = report([point('2026-09-14 01:00', 10)]).fiveHourPeaks!;
    expect(free.status).toBe('ready'); expect(free.mostRequests).toMatchObject({ requests: 10, actualCost: '0' }); expect(free.highestSpend).toBeNull();
    expect(report([]).fiveHourPeaks).toEqual({ status: 'ready', eligibleWindows: 14, mostRequests: null, highestSpend: null });
    expect(report([], { coverage: { ...coverage, availableFrom: null } }).fiveHourPeaks).toEqual({ status: 'insufficient-history', eligibleWindows: 0, mostRequests: null, highestSpend: null });
  });

  it('includes idle hours but excludes partial first/current hours and requires five completed hours', () => {
    const rows = [point('2026-09-14 00:00', 9999, '999'), point('2026-09-14 01:00', 2, '0.2'), point('2026-09-14 05:00', 3, '0.3'), point('2026-09-14 06:00', 9999, '999')];
    expect(report([], { now: Date.parse('2026-09-14T04:59:59Z') }).fiveHourPeaks!.status).toBe('insufficient-history');
    expect(report([], { now: Date.parse('2026-09-14T05:00:00Z') }).fiveHourPeaks).toMatchObject({ status: 'ready', eligibleWindows: 1 });
    const partial = { ...coverage, availableFrom: '2026-09-14T00:01:00Z' };
    expect(report(rows, { coverage: partial, now: Date.parse('2026-09-14T05:59:59Z') }).fiveHourPeaks!.status).toBe('insufficient-history');
    expect(report(rows, { coverage: partial, now: Date.parse('2026-09-14T06:00:00Z') }).fiveHourPeaks).toMatchObject({ eligibleWindows: 1, mostRequests: { startAt: '2026-09-14T01:00:00.000Z', endAt: '2026-09-14T06:00:00.000Z', requests: 5, actualCost: '0.5' } });
    const trend = report(rows, { coverage: partial, now: Date.parse('2026-09-14T06:00:00Z') }).usageTrend;
    expect(trend.granularity).toBe('hour'); expect(trend.points).toHaveLength(7);
    expect(trend.points[0]).toMatchObject({ requests: 9999, actualCost: '999', partial: true });
    expect(trend.points[6]).toMatchObject({ period: '2026-09-14 06:00', requests: 9999, actualCost: '999', partial: true });
    expect(trend.points[2]).toMatchObject({ covered: true, partial: false, requests: 0, actualCost: '0' });
  });

  it('keeps windows inside today and emits absolute bounds aligned to the reporting timezone', () => {
    const local = { timezone: 'Asia/Kolkata', now: Date.parse('2026-09-14T05:00:00+05:30'), coverage: { ...coverage, availableFrom: '2026-09-13T00:00:00+05:30' } };
    const rows = [point('2026-09-13 23:00', 999), point('2026-09-14 00:00', 1), point('2026-09-14 04:00', 2), point('2026-09-14 05:00', 999)];
    expect(report(rows, local).fiveHourPeaks!.mostRequests).toEqual({ startAt: '2026-09-13T18:30:00.000Z', endAt: '2026-09-13T23:30:00.000Z', requests: 3, actualCost: '0' });
  });

  it('preserves winners across midnight, Monday, chunk boundaries and reverse completion order', () => {
    const longInput = { ...input, startDate: '2026-09-07', endDate: '2026-09-15', now: Date.parse('2026-09-15T12:00:00Z'), coverage: { ...coverage, availableFrom: '2026-09-07T00:00:00Z' } };
    const rows = ['2026-09-13 22:00', '2026-09-13 23:00', '2026-09-14 00:00', '2026-09-14 01:00', '2026-09-14 02:00'].map(period => point(period, 10, '0.1'));
    const complete = activityReport({ ...longInput, rows }).fiveHourPeaks!;
    expect(complete).toMatchObject({ eligibleWindows: 200, mostRequests: { startAt: '2026-09-13T22:00:00.000Z', endAt: '2026-09-14T03:00:00.000Z', requests: 50, actualCost: '0.5' } });
    for (const ranges of [chunks(longInput.startDate, longInput.endDate, 7), chunks(longInput.startDate, longInput.endDate, 7).reverse()]) {
      const stream = pagedActivity({ ...longInput, page: 1 });
      for (const range of ranges) stream.add(range.startDate, range.endDate, rows.filter(row => row.period.slice(0, 10) >= range.startDate && row.period.slice(0, 10) <= range.endDate));
      expect(stream.finish().fiveHourPeaks).toEqual(complete);
    }
  });

  it('does not bridge a missing day or an invalid hour when joining chunk edges', () => {
    const fold = fiveHourPeaks('UTC');
    const hours = (day: string) => Array.from({ length: 24 }, (_, hour) => ({ period: `${day} ${String(hour).padStart(2, '0')}:00`, covered: true, partial: hour === 12, requests: 1, actualCost: '0.1' }));
    fold.add(hours('2026-09-12')); fold.add(hours('2026-09-14'));
    expect(fold.finish()).toMatchObject({ eligibleWindows: 30, mostRequests: { startAt: '2026-09-12T00:00:00.000Z', requests: 5, actualCost: '0.5' } });
    expect(fold.finish()).toEqual(fold.finish());
  });

  it.each(['2026-03-08', '2026-11-01'])('marks ambiguous DST history unavailable on %s without disabling activity', day => {
    const data = report([point(`${day} 10:00`, 10, '1')], { startDate: day, endDate: day, timezone: 'America/New_York', now: Date.parse(`${day}T22:00:00-05:00`), coverage: { ...coverage, availableFrom: `${day}T00:00:00-05:00` } });
    expect(data.fiveHourPeaks).toEqual({ status: 'unsupported-timezone', eligibleWindows: 0, mostRequests: null, highestSpend: null });
    expect(data.peakRequests).toMatchObject({ requests: 10 });
  });
});
