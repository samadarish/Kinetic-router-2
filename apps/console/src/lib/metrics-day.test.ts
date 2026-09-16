import { afterEach, describe, expect, it, vi } from 'vitest';
import { dateInTimezone } from '@kineticrouter/analytics-client';
import type { MetricsAverages } from '@kineticrouter/portal-contract';
import { currentMetricsAverages, currentMetricsSnapshot, watchMetricsDay } from './metrics-day';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('today metrics rollover', () => {
  it.each([
    ['Asia/Kolkata', '2026-09-14T18:29:59Z', '2026-09-15'],
    ['America/New_York', '2026-03-09T03:59:59Z', '2026-03-09'],
    ['America/New_York', '2026-11-02T04:59:59Z', '2026-11-02'],
  ])('changes dates exactly at midnight in %s', (timezone, at, nextDate) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(at));
    vi.stubGlobal('document', new EventTarget()); vi.stubGlobal('window', new EventTarget());
    const update = vi.fn();
    const stop = watchMetricsDay(timezone, update);
    const lastDate = () => dateInTimezone(update.mock.lastCall![0], timezone);
    expect(lastDate()).not.toBe(nextDate);
    vi.advanceTimersByTime(999); expect(update).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1); expect(lastDate()).toBe(nextDate);
    stop(); expect(vi.getTimerCount()).toBe(0);
  });

  it('recovers immediately on visibility and focus changes and removes timers/listeners on cleanup', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-14T18:00:00Z'));
    const document = new EventTarget(), window = new EventTarget();
    vi.stubGlobal('document', document); vi.stubGlobal('window', window);
    const update = vi.fn(), stop = watchMetricsDay('Asia/Kolkata', update);
    vi.advanceTimersByTime(60000); expect(update).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date('2026-09-15T18:45:00Z'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(dateInTimezone(update.mock.lastCall![0], 'Asia/Kolkata')).toBe('2026-09-16');
    vi.setSystemTime(new Date('2026-09-16T18:45:00Z'));
    window.dispatchEvent(new Event('focus'));
    expect(dateInTimezone(update.mock.lastCall![0], 'Asia/Kolkata')).toBe('2026-09-17');
    expect(vi.getTimerCount()).toBe(1);
    stop(); update.mockClear();
    document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(120000); expect(update).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it('suppresses late or cached reports from yesterday and from other reporting timezones', () => {
    const data: MetricsAverages = { scope: 'today', reportingDate: '2026-09-14', periodStart: '2026-09-13T18:30:00.000Z', generatedAt: '2026-09-14T18:29:59Z', timezone: 'Asia/Kolkata', elapsedHours: 23, totalRequests: 10, actualCost: '1', hourly: null, fiveHourly: null, weekly: null, coverage: { availableFrom: null, through: '2026-09-14T18:29:59Z', complete: false, basis: 'retained-api-history', storage: 'upstream', notice: 'Retained usage' } };
    const before = Date.parse(data.generatedAt), after = before + 1000;
    expect(currentMetricsAverages(data, 'Asia/Kolkata', before)).toBe(data);
    expect(currentMetricsAverages(data, 'Asia/Calcutta', before)).toBe(data);
    expect(currentMetricsAverages(data, 'UTC', before)).toBeUndefined();
    expect(currentMetricsAverages(data, 'Asia/Kolkata', after)).toBeUndefined();
    expect(currentMetricsAverages(undefined, 'Asia/Kolkata', after)).toBeUndefined();
    expect(currentMetricsAverages({ ...data, scope: 'all-time' }, 'Asia/Kolkata', before)).toBeUndefined();
    expect(currentMetricsAverages(data, 'Asia/Kolkata', before, 'all-time')).toBeUndefined();
    const peak = { scope: 'all-time' as const, reportingDate: data.reportingDate, timezone: data.timezone, fiveHourPeaks: { mostRequests: null } };
    expect(currentMetricsSnapshot(peak, 'Asia/Calcutta', before, 'all-time')).toBe(peak);
    expect(currentMetricsSnapshot(peak, 'Asia/Kolkata', after, 'all-time')).toBeUndefined();
    expect(currentMetricsSnapshot(peak, 'UTC', before, 'all-time')).toBeUndefined();
    expect(currentMetricsSnapshot(peak, 'Asia/Kolkata', before)).toBeUndefined();
  });
});
