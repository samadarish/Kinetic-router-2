import { describe, expect, it } from 'vitest';
import type { MetricsCoverage } from '@kineticrouter/portal-contract';
import type { CustomerUsagePoint } from '@kineticrouter/sub2api-client';
import { activityReport, pagedActivity } from '../apps/bff/src/metrics/activity';
import { chunks } from '../apps/bff/src/metrics/time';

describe('streamed all-time activity', () => {
  it('matches a complete report with reversed chunks, split weeks, idle hours and precise spend', () => {
    const coverage: MetricsCoverage = { availableFrom: '2025-12-30T04:45:00Z', through: '2026-04-06T04:45:00Z', complete: false, basis: 'retained-api-history', storage: 'upstream', notice: 'Retained history' };
    const input = { startDate: '2025-12-30', endDate: '2026-04-06', now: Date.parse(coverage.through), timezone: 'Asia/Kolkata', source: 'api' as const, coverage };
    const rows: CustomerUsagePoint[] = [
      { period: '2025-12-30 10:00', userId: '1', requests: 999, actualCost: '99' }, // Partial first hour is excluded from peaks.
      { period: '2026-01-01 11:00', userId: '1', requests: 10, actualCost: '0.1' },
      { period: '2026-01-05 11:00', userId: '1', requests: 10, actualCost: '0.2' },
      { period: '2026-01-06 11:00', userId: '1', requests: 2, actualCost: '0.3' }, // Same week across a Tuesday chunk boundary.
      { period: '2026-01-06 11:00', userId: '2', requests: 1, actualCost: '0.000000000001' },
      { period: '2026-04-06 10:00', userId: '1', requests: 1000, actualCost: '100' }, // Current hour is excluded.
    ];
    const complete = activityReport({ ...input, rows });
    const build = (page: number) => {
      const result = pagedActivity({ ...input, page });
      for (const range of chunks(input.startDate, input.endDate, 7).reverse()) result.add(range.startDate, range.endDate, rows.filter(row => row.period.slice(0, 10) >= range.startDate && row.period.slice(0, 10) <= range.endDate));
      return result.finish();
    };
    const latest = build(1), older = build(2);
    expect(latest.heatmap).toEqual(complete.heatmap); expect(older.heatmap).toEqual(complete.heatmap);
    expect(latest.peakRequests).toEqual(complete.peakRequests); expect(latest.peakRequests!.period).toBe('2026-01-01 11:00');
    expect(latest.peakUsers).toEqual(complete.peakUsers);
    expect(latest.fiveHourPeaks).toEqual(complete.fiveHourPeaks); expect(older.fiveHourPeaks).toEqual(complete.fiveHourPeaks);
    expect(latest.activeUsage).toEqual(complete.activeUsage); expect(older.activeUsage).toEqual(complete.activeUsage);
    expect(latest.activeUsage).toMatchObject({ activeHours: 3, totalRequests: 23, actualCost: '0.600000000001', completedThrough: '2026-04-06T04:30:00.000Z' });
    expect(latest.usageTrend).toEqual(complete.usageTrend); expect(older.usageTrend).toEqual(complete.usageTrend);
    expect(latest.usageTrend.points[0]).toMatchObject({ period: '2025-12-30', partial: true, requests: 999 });
    expect(latest.usageTrend.points.at(-1)).toMatchObject({ period: '2026-04-06', partial: true, requests: 1000 });
    expect([...older.weeks, ...latest.weeks]).toEqual(complete.weeks);
    const week = [...older.weeks, ...latest.weeks].find(row => row.period === '2026-01-05')!;
    expect(week).toMatchObject({ users: 2, requests: 13, actualCost: '0.500000000001' });
    expect(latest.pagination!.totalWeeks).toBe(15); expect(latest.weeks).toHaveLength(13); expect(older.weeks).toHaveLength(2);
    expect(build(999).pagination!.page).toBe(2);
  });
});
