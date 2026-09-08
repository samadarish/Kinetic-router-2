import { afterEach, describe, expect, it, vi } from 'vitest';
import { usageSummaryQuerySchema, usageSummarySchema } from '@kineticrouter/portal-contract';
import { getUsagePresetRange } from '../apps/console/src/components/UsageDateRangePicker';

afterEach(() => vi.useRealTimers());

describe('usage analytics date ranges', () => {
  it('uses local calendar dates for the screenshot presets', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 30, 12, 0, 0));
    expect(getUsagePresetRange('last-24-hours')).toEqual({ startDate: '2026-08-29', endDate: '2026-08-30', label: 'Last 24 Hours' });
    expect(getUsagePresetRange('last-7-days')).toEqual({ startDate: '2026-08-24', endDate: '2026-08-30', label: 'Last 7 Days' });
    expect(getUsagePresetRange('this-month')).toEqual({ startDate: '2026-08-01', endDate: '2026-08-30', label: 'This Month' });
    expect(getUsagePresetRange('last-month')).toEqual({ startDate: '2026-07-01', endDate: '2026-07-31', label: 'Last Month' });
  });

  it('handles month and year boundaries without UTC conversion', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    expect(getUsagePresetRange('yesterday')).toEqual({ startDate: '2025-12-31', endDate: '2025-12-31', label: 'Yesterday' });
    expect(getUsagePresetRange('last-month')).toEqual({ startDate: '2025-12-01', endDate: '2025-12-31', label: 'Last Month' });
  });

  it('accepts real ordered dates and rejects invalid or reversed ranges', () => {
    expect(usageSummaryQuerySchema.safeParse({ startDate: '2026-02-28', endDate: '2026-03-01' }).success).toBe(true);
    expect(usageSummaryQuerySchema.safeParse({ startDate: '2026-02-30', endDate: '2026-03-01' }).success).toBe(false);
    expect(usageSummaryQuerySchema.safeParse({ startDate: '2026-03-02', endDate: '2026-03-01' }).success).toBe(false);
    expect(usageSummaryQuerySchema.safeParse({ startDate: '2024-01-01', endDate: '2024-12-31' }).success).toBe(true);
    expect(usageSummaryQuerySchema.safeParse({ startDate: '2024-01-01', endDate: '2025-01-01' }).success).toBe(false);
  });

  it('accepts the current aggregate contract and rejects the legacy dashboard shape', () => {
    const current = {
      range: { startDate: '2026-08-29', endDate: '2026-08-30', granularity: 'hour', timezone: 'Asia/Kolkata' },
      stats: {
        totalRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheReadTokens: 0,
        totalCacheCreationTokens: 0,
        totalTokens: 0,
        actualCost: '0',
        averageDurationMs: 0,
        cacheHitRate: 0,
      },
      trend: [],
      models: [],
      groups: [],
      endpoints: [],
    };
    expect(usageSummarySchema.safeParse(current).success).toBe(true);
    expect(usageSummarySchema.safeParse({ ...current, stats: { ...current.stats, actualCost: 'NaN' } }).success).toBe(false);
    expect(usageSummarySchema.safeParse({
      stats: { totalRequests: 3, totalTokens: 185, totalActualCost: '0.2' },
      trend: [{ timestamp: '2026-08-30', tokens: 185, actualCost: '0.2' }],
      models: [{ model: 'gpt-5.6-sol', requests: 3, totalTokens: 185, actualCost: '0.2' }],
    }).success).toBe(false);
  });
});
