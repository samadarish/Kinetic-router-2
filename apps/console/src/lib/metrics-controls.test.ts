import { describe, expect, it } from 'vitest';
import { initialMetricsControls, metricsControlsReducer as reduce, metricsReportParams } from './metrics-controls';

const range = { startDate: '2026-08-18', endDate: '2026-09-14', label: 'Last 28 days' };
describe('independent Metrics controls', () => {
  it('opens on Today usage and preserves each view while navigating and changing its controls', () => {
    let state = initialMetricsControls(range);
    expect(state.view).toBe('usage'); expect(state.usage.scope).toBe('today');
    state = reduce(state, { type: 'usage', scope: 'all-time' });
    state = reduce(state, { type: 'usageMetric', metric: 'requests' });
    state = reduce(state, { type: 'view', view: 'customers' });
    const activity = state.activity, usage = state.usage;
    state = reduce(state, { type: 'dates', view: 'customers' });
    state = reduce(state, { type: 'customerFilters', cohort: 'heavy', input: 'alice' });
    state = reduce(state, { type: 'page', view: 'customers', page: 3 });
    state = reduce(state, { type: 'refresh', view: 'customers', generation: 123 });
    expect(state.activity).toBe(activity); expect(state.usage).toBe(usage);
    const customers = state.customers;
    state = reduce(state, { type: 'view', view: 'activity' });
    state = reduce(state, { type: 'source', source: 'console' });
    state = reduce(state, { type: 'activityMetric', metric: 'requests' });
    state = reduce(state, { type: 'dates', view: 'activity', range: { ...range, startDate: '2026-09-14', label: 'Custom dates' } });
    state = reduce(state, { type: 'refresh', view: 'activity', generation: 456 });
    expect(state.customers).toBe(customers); expect(state.usage).toBe(usage);
    expect(metricsReportParams(state.customers)).toEqual({ range: 'all-time', refresh: 123 });
    expect(metricsReportParams(state.activity)).toEqual({ startDate: '2026-09-14', endDate: '2026-09-14', refresh: 456 });
    state = reduce(state, { type: 'view', view: 'usage' });
    expect(state.usage).toEqual({ scope: 'all-time', metric: 'requests', refresh: 0 });
  });
  it('resets only relevant pagination and keeps customer table filters separate from dates', () => {
    let state = initialMetricsControls(range);
    state = reduce(state, { type: 'page', view: 'customers', page: 4 });
    state = reduce(state, { type: 'page', view: 'activity', page: 2 });
    state = reduce(state, { type: 'customerFilters', input: 'name' });
    expect(state.customers.page).toBe(1); expect(state.activity.page).toBe(2);
    expect(state.customers.range).toEqual(range);
    state = reduce(state, { type: 'source', source: 'console' });
    expect(state.activity.page).toBe(1); expect(state.customers.input).toBe('name');
    state = reduce(state, { type: 'timezone', range: { ...range, startDate: '2026-08-19', endDate: '2026-09-15' } });
    expect(state.customers.range).toEqual(state.activity.range); expect(state.activity.source).toBe('console');
  });
});
