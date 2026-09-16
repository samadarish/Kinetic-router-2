import type { MetricsActiveUsage, MetricsBucket } from '@kineticrouter/portal-contract';
import { amount, money, rate } from './math.js';
import { localMidnight } from './time.js';

type Hour = Pick<MetricsBucket, 'period' | 'requests' | 'actualCost' | 'covered' | 'partial'>;
const HOUR = 3600000;

/** Fold disjoint, combined-customer hours. Partial hours never enter either total. */
export function activeHourUsage(timezone: string) {
  let completedHours = 0, activeHours = 0, totalRequests = 0, cost = 0n;
  let lastCompleted: string | null = null;
  return {
    add(hours: Hour[]) {
      for (const hour of hours) {
        if (!hour.covered || hour.partial) continue;
        completedHours++;
        if (!lastCompleted || hour.period > lastCompleted) lastCompleted = hour.period;
        if (hour.requests <= 0) continue;
        activeHours++;
        totalRequests += hour.requests;
        if (!Number.isSafeInteger(totalRequests)) throw new Error('Active-hour request totals exceed the supported range.');
        cost += amount(hour.actualCost);
      }
    },
    finish(unsupportedTimezone: boolean): MetricsActiveUsage {
      // Use the same civil-hour ambiguity check as five-hour peaks.
      if (unsupportedTimezone) return { status: 'unsupported-timezone', completedThrough: null, completedHours: null, activeHours: null, totalRequests: null, actualCost: null, hourly: null, fiveHourly: null };
      const average = (hours: number) => activeHours ? { requests: totalRequests * (hours / activeHours), actualCost: rate(cost, activeHours * HOUR, hours) } : null;
      const completedThrough = lastCompleted ? new Date(Date.parse(localMidnight(lastCompleted.slice(0, 10), timezone)) + (Number(lastCompleted.slice(11, 13)) + 1) * HOUR).toISOString() : null;
      return { status: completedHours ? 'ready' : 'insufficient-history', completedThrough, completedHours, activeHours, totalRequests, actualCost: money(cost), hourly: average(1), fiveHourly: average(5) };
    },
  };
}
