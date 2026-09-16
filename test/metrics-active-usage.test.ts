import { describe, expect, it } from 'vitest';
import { metricsActiveUsageSchema, type MetricsCoverage } from '@kineticrouter/portal-contract';
import type { CustomerUsagePoint } from '@kineticrouter/sub2api-client';
import { activityReport } from '../apps/bff/src/metrics/activity';

const coverage: MetricsCoverage = { availableFrom: '2026-09-14T00:00:00Z', through: '2026-09-14T14:00:00Z', complete: false, basis: 'retained-api-history', storage: 'upstream', notice: 'Retained history' };
const input = { startDate: '2026-09-14', endDate: '2026-09-14', timezone: 'UTC', now: Date.parse(coverage.through), source: 'api' as const, coverage };
const point = (hour: number, requests: number, actualCost: string, userId = '1'): CustomerUsagePoint => ({ period: `2026-09-14 ${String(hour).padStart(2, '0')}:00`, requests, actualCost, userId });

describe('completed active-hour averages', () => {
  it('excludes sleeping gaps and counts shared customer hours once', () => {
    const rows = [0, 2, 4, 6, 8, 10, 12].flatMap(hour => [point(hour, 100, '10'), point(hour, 100, '10', '2')]);
    const data = metricsActiveUsageSchema.parse(activityReport({ ...input, rows }).activeUsage);
    expect(data).toEqual({ status: 'ready', completedThrough: '2026-09-14T14:00:00.000Z', completedHours: 14, activeHours: 7, totalRequests: 1400, actualCost: '140', hourly: { requests: 200, actualCost: '20' }, fiveHourly: { requests: 1000, actualCost: '100' } });
  });

  it('uses precise included totals and excludes partial usage and spend-only idle hours', () => {
    const data = activityReport({ ...input, now: Date.parse('2026-09-14T14:30:00Z'), coverage: { ...coverage, availableFrom: '2026-09-14T00:30:00Z' }, rows: [
      point(0, 9999, '999'), point(14, 9999, '999'), point(1, 2, '0.01'), point(1, 1, '0.02', '2'), point(3, 3, '0.07'), point(5, 3, '0'), point(7, 0, '50'),
    ] });
    expect(data.activeUsage).toEqual({ status: 'ready', completedThrough: '2026-09-14T14:00:00.000Z', completedHours: 13, activeHours: 3, totalRequests: 9, actualCost: '0.1', hourly: { requests: 3, actualCost: '0.033333333333' }, fiveHourly: { requests: 15, actualCost: '0.166666666666' } });
    expect(data.usageTrend.points[0]).toMatchObject({ requests: 9999, partial: true });
    expect(data.usageTrend.points.at(-1)).toMatchObject({ requests: 9999, partial: true });
  });

  it('is ready after one completed active hour, including zero-cost requests', () => {
    const rows = [point(0, 10, '0')];
    const before = activityReport({ ...input, rows, now: Date.parse('2026-09-14T00:59:59Z') });
    expect(before.activeUsage).toMatchObject({ status: 'insufficient-history', completedThrough: null, completedHours: 0, activeHours: 0, totalRequests: 0, actualCost: '0', hourly: null, fiveHourly: null });
    const after = activityReport({ ...input, rows, now: Date.parse('2026-09-14T01:00:00Z') });
    expect(after.fiveHourPeaks!.status).toBe('insufficient-history');
    expect(after.activeUsage).toMatchObject({ status: 'ready', completedHours: 1, activeHours: 1, hourly: { requests: 10, actualCost: '0' }, fiveHourly: { requests: 50, actualCost: '0' } });
  });

  it('distinguishes completed idle history from unavailable history', () => {
    expect(activityReport({ ...input, rows: [] }).activeUsage).toMatchObject({ status: 'ready', completedHours: 14, activeHours: 0, totalRequests: 0, actualCost: '0', hourly: null, fiveHourly: null });
    expect(activityReport({ ...input, coverage: { ...coverage, availableFrom: null }, rows: [] }).activeUsage).toMatchObject({ status: 'insufficient-history', completedHours: 0, completedThrough: null });
    expect(activityReport({ ...input, source: 'console', rows: [] }).activeUsage).toBeNull();
  });

  it.each(['2026-03-08', '2026-11-01'])('leaves ambiguous clock-transition history unavailable on %s', day => {
    const report = activityReport({ ...input, startDate: day, endDate: day, timezone: 'America/New_York', now: Date.parse(`${day}T20:00:00Z`), coverage: { ...coverage, availableFrom: `${day}T05:00:00Z` }, rows: [] });
    expect(metricsActiveUsageSchema.parse(report.activeUsage)).toEqual({ status: 'unsupported-timezone', completedThrough: null, completedHours: null, activeHours: null, totalRequests: null, actualCost: null, hourly: null, fiveHourly: null });
    expect(report.usageTrend.points.length).toBeGreaterThan(0);
  });

  it('uses the reporting timezone for the exclusive completed-hour cutoff', () => {
    const report = activityReport({ ...input, timezone: 'Asia/Kolkata', now: Date.parse('2026-09-14T02:30:00+05:30'), coverage: { ...coverage, availableFrom: '2026-09-14T00:00:00+05:30' }, rows: [point(0, 2, '0.000000000001')] });
    expect(report.activeUsage).toMatchObject({ completedThrough: '2026-09-13T20:30:00.000Z', completedHours: 2, activeHours: 1, hourly: { actualCost: '0.000000000001' }, fiveHourly: { actualCost: '0.000000000005' } });
  });
});
