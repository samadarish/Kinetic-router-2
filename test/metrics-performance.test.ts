import { describe, expect, it, vi } from 'vitest';
import type { MetricsCoverage } from '@kineticrouter/portal-contract';
import type { CustomerUsagePoint } from '@kineticrouter/sub2api-client';
import { activityReport, pagedActivity } from '../apps/bff/src/metrics/activity';
import { addDays, chunks, isHourStart, localMidnight } from '../apps/bff/src/metrics/time';

const startDate = '2026-01-01', endDate = '2026-04-17';
const rows: CustomerUsagePoint[] = [];
for (let day = startDate; day <= endDate; day = addDays(day, 1)) {
  for (const hour of [0, 1, 4, 11, 14, 23]) for (let user = 0; user < 4; user++) {
    rows.push({ period: `${day} ${String(hour).padStart(2, '0')}:00`, userId: String(user), requests: (hour + user) % 5, actualCost: user % 2 ? '0' : '0.000000000001' });
  }
}

describe('metrics aggregation equivalence', () => {
  it.each(['UTC', 'Asia/Kathmandu', 'America/New_York'])('preserves every global summary and detail page across unordered chunks in %s', timezone => {
    const now = Date.parse(localMidnight(endDate, timezone)) + 14.25 * 3600000;
    const coverage: MetricsCoverage = { availableFrom: new Date(Date.parse(localMidnight(startDate, timezone)) + 45 * 60000).toISOString(), through: new Date(now).toISOString(), complete: false, basis: 'retained-api-history', storage: 'upstream', notice: 'Retained history' };
    for (const source of ['api', 'console'] as const) {
      const input = { startDate, endDate, timezone, now, coverage, source };
      const complete = activityReport({ ...input, rows });
      for (const days of [1, 3, 7]) {
        const batches = chunks(startDate, endDate, days).reverse().map(range => ({ ...range, rows: rows.filter(row => row.period.slice(0, 10) >= range.startDate && row.period.slice(0, 10) <= range.endDate) }));
        const detailWeeks = [];
        for (const page of [2, 1]) {
          const stream = pagedActivity({ ...input, page });
          for (const batch of batches) stream.add(batch.startDate, batch.endDate, batch.rows);
          const result = stream.finish();
          for (const key of ['heatmap', 'peakUsers', 'peakRequests', 'fiveHourPeaks', 'activeUsage', 'usageTrend'] as const) expect(result[key]).toEqual(complete[key]);
          detailWeeks.push(...result.weeks);
        }
        expect(detailWeeks).toEqual(complete.weeks);
      }
    }
  });

  it.each(['api', 'console'] as const)('preserves weekly overflow rejection for partial %s hours omitted from active totals', source => {
    const coverage: MetricsCoverage = { availableFrom: '2026-01-01T23:30:00Z', through: '2026-01-02T00:30:00Z', complete: false, basis: 'retained-api-history', storage: 'upstream', notice: 'Retained history' };
    const input = { startDate, endDate: '2026-01-02', timezone: 'UTC', now: Date.parse(coverage.through), coverage, source };
    const overflow = ['2026-01-01 23:00', '2026-01-02 00:00'].map(period => ({ period, userId: '1', requests: Number.MAX_SAFE_INTEGER, actualCost: '0' }));
    const stream = pagedActivity({ ...input, page: 1 });
    expect(() => activityReport({ ...input, rows: overflow })).toThrow('Activity totals exceed the supported range.');
    expect(() => stream.add('2026-01-01', '2026-01-02', overflow)).toThrow('Activity totals exceed the supported range.');
  });

  it('reuses timezone formatters across dates without changing midnight or hour-start precision', () => {
    const timezone = 'Pacific/Marquesas';
    // Warm each formatter before spying, so this assertion is independent of test order.
    localMidnight('2026-01-01', timezone); isHourStart(Date.parse('2026-01-01T09:30:00Z'), timezone);
    const formatter = vi.spyOn(Intl, 'DateTimeFormat');
    try {
      for (const day of ['2026-09-14', '2026-01-02', '2026-09-15']) {
        const midnight = localMidnight(day, timezone);
        expect(midnight).toBe(`${day}T09:30:00.000Z`);
        expect(isHourStart(Date.parse(midnight), timezone)).toBe(true);
        expect(isHourStart(Date.parse(midnight) + 60000, timezone)).toBe(false);
        expect(isHourStart(Date.parse(midnight) + 1, timezone)).toBe(false);
      }
      expect(formatter).not.toHaveBeenCalled();
    } finally { formatter.mockRestore(); }
  });
});
