import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActivityView, AverageCards, MetricsPage, MetricsTabs, PeakSection, RecordedUsage, ReportingControls, metricsRange } from './MetricsPage';
import type { MetricsActivity, MetricsAverages, MetricsPeaks } from '@kineticrouter/portal-contract';
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'admin', role: 'admin', status: 'active' } }) }));
afterEach(() => vi.unstubAllGlobals());

describe('metrics reporting UI', () => {
  it('opens only the Today usage view and enables only its own requests', () => {
    vi.stubGlobal('document', { visibilityState: 'visible' });
    const client = new QueryClient();
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><MetricsPage /></QueryClientProvider>);
    expect(html).toContain('Today usage'); expect(html).toContain('Refresh usage');
    expect(html).toContain('Recorded usage'); expect(html).toContain('Active-hour averages'); expect(html).toContain('Overall averages · Includes idle time'); expect(html).toContain('Busiest actual periods');
    expect(html).not.toContain('Report dates'); expect(html).not.toContain('Find a customer'); expect(html).not.toContain('Activity source');
    const active = client.getQueryCache().getAll().filter(query => query.queryKey[0] === 'metrics' && (query.options as { enabled?: boolean }).enabled);
    expect(active.map(query => query.queryKey[4]).sort()).toEqual(['averages', 'peaks']);
    expect(active.every(query => query.queryKey[3] === 'usage' && (query.queryKey[7] as { scope: string }).scope === 'today')).toBe(true);
    client.clear();
    const tabs = renderToStaticMarkup(<MetricsTabs view="customers" onChange={() => {}} />);
    expect(tabs.match(/role="tab"/g)).toHaveLength(3); expect(tabs).toContain('aria-controls="metrics-panel-customers" tabindex="0"');
  });
  it('separates recorded totals from today estimates and all-time rates, using live values in the calculation flow', () => {
    const data: MetricsAverages = { scope: 'today', generatedAt: '2026-09-15T07:00:00Z', timezone: 'Asia/Kolkata', coverage: { availableFrom: '2026-09-14T18:30:00Z', through: '2026-09-15T07:00:00Z', complete: false, basis: 'retained-api-history', storage: 'upstream', notice: 'Retained usage.' }, reportingDate: '2026-09-15', periodStart: '2026-09-14T18:30:00.000Z', elapsedHours: 12.5, totalRequests: 125, actualCost: '12.5', hourly: { requests: 10, actualCost: '1' }, fiveHourly: { requests: 50, actualCost: '5' }, weekly: { requests: 1680, actualCost: '168' } };
    const recorded = renderToStaticMarkup(<RecordedUsage data={data} />);
    expect(recorded).toContain('Billed spend'); expect(recorded).toContain('$12.50'); expect(recorded).toContain('125'); expect(recorded).toContain('Since midnight'); expect(recorded).toContain('Sep 15, 2026'); expect(recorded).not.toContain('estimate');
    const html = renderToStaticMarkup(<AverageCards data={data} />);
    expect(html.match(/<h4>.*?<\/h4>/g)).toEqual(['<h4>Average per hour</h4>', '<h4>5-hour estimate</h4>', '<h4>7-day estimate</h4>']);
    for (const value of ['$168.00', '1,680', '12.5 elapsed hours', 'Includes idle time', 'How this is calculated', 'Recorded usage', 'Multiplied by 168 hours', 'This uses only today’s recorded usage', 'not the total from the last seven days']) expect(html).toContain(value);
    expect(html).not.toContain('10 hours');
    const allTime = renderToStaticMarkup(<AverageCards data={{ ...data, scope: 'all-time', elapsedHours: 720 }} />);
    expect(allTime).toContain('Average per 5 hours'); expect(allTime).toContain('Average per 7 days'); expect(allTime).toContain('30 days of available history'); expect(allTime).not.toContain('<h4>7-day estimate');
    const empty = { ...data, totalRequests: 0, actualCost: '0', hourly: { requests: 0, actualCost: '0' }, fiveHourly: { requests: 0, actualCost: '0' }, weekly: { requests: 0, actualCost: '0' } };
    expect(renderToStaticMarkup(<AverageCards data={empty} />)).not.toContain('—');
    expect(renderToStaticMarkup(<AverageCards data={{ ...empty, elapsedHours: 0, hourly: null, fiveHourly: null, weekly: null }} />)).toContain('Averages begin once time has elapsed today.');
    expect(renderToStaticMarkup(<RecordedUsage data={{ ...empty, scope: 'all-time', periodStart: null }} />)).toContain('No customer API history is available yet.');
    expect(renderToStaticMarkup(<RecordedUsage data={{ ...data, actualCost: '72.5747', totalRequests: 11512 }} />)).toContain('Exact amount: $72.5747');
  });
  it('offers All time beside custom dates and marks only the selected preset', () => {
    const props = { range: metricsRange(28), timezone: 'Asia/Kolkata', applyRange: () => {}, selectAllTime: () => {} };
    const all = renderToStaticMarkup(<ReportingControls {...props} allTime />);
    expect(all).toContain('<button aria-pressed="true">All time</button>'); expect(all).toContain('Custom dates'); expect(all).toContain('aria-pressed="false">28 days');
    const custom = renderToStaticMarkup(<ReportingControls {...props} allTime={false} />);
    expect(custom).toContain('<button aria-pressed="false">All time</button>'); expect(custom).toContain('aria-pressed="true">28 days');
  });
  it('opens with 28 local calendar days and supports a different preset', () => {
    const now = Date.parse('2026-09-14T18:45:00Z');
    expect(metricsRange(28, 'Asia/Kolkata', now)).toEqual({ startDate: '2026-08-19', endDate: '2026-09-15', label: 'Last 28 days' });
    expect(metricsRange(7, 'Asia/Kolkata', now).startDate).toBe('2026-09-09');
  });
  it('renders separate activity measures, unavailable hours, and accessible expansion controls', () => {
    const data: MetricsActivity = { activeUsage: null, usageTrend: { granularity: 'hour', points: [] }, range: { mode: 'custom', startDate: '2026-09-07', endDate: '2026-09-07' }, pagination: null, source: 'api', generatedAt: '2026-09-14T00:00:00Z', timezone: 'Asia/Kolkata', coverage: { availableFrom: null, through: '2026-09-14T00:00:00Z', complete: false, basis: 'retained-api-history', storage: 'upstream', notice: 'Missing history is unavailable.' }, peakUsers: null, peakRequests: null, fiveHourPeaks: null,
      heatmap: Array.from({ length: 168 }, (_, i) => ({ weekday: Math.floor(i / 24), hour: i % 24, occurrences: 0, users: 0, requests: 0, actualCost: '0' })),
      weeks: [{ period: '2026-09-07', level: 'week', users: 0, requests: 0, actualCost: '0', covered: false, partial: true, children: [{ period: '2026-09-07', level: 'day', users: 0, requests: 0, actualCost: '0', covered: false, partial: true, children: [{ period: '2026-09-07 00:00', level: 'hour', users: 0, requests: 0, actualCost: '0', covered: false, partial: false, children: [] }] }] }] };
    const html = renderToStaticMarkup(<ActivityView data={data} />);
    expect(html).toContain('aria-label="Collapse Week of 2026-09-07"');
    expect(html).toContain('aria-label="Expand 2026-09-07"');
    expect(html).toContain('Monday 00:00: unavailable'); expect(html).toContain('Highest API request volume'); expect(html).toContain('Billed spend');
    expect(renderToStaticMarkup(<ActivityView data={{ ...data, source: 'console' }} />)).not.toContain('Highest API request volume');
    expect(renderToStaticMarkup(<ActivityView data={{ ...data, coverage: { ...data.coverage, availableFrom: '2026-09-13T18:30:00.000Z' } }} />)).toContain('Available from Sep 14, 2026.');
    const paged = renderToStaticMarkup(<ActivityView data={{ ...data, range: { mode: 'all-time', startDate: '2024-01-01', endDate: '2026-09-14' }, pagination: { page: 1, pageSize: 13, totalPages: 11, totalWeeks: 142, startDate: '2026-06-22', endDate: '2026-09-14' } }} setPage={() => {}} />);
    expect(paged).toContain('Page 1 of 11'); expect(paged).toContain('Older weeks'); expect(paged).toContain('Newer weeks'); expect(paged).toContain('Charts and peaks cover all available history.');
    expect(paged).toContain('Recorded activity over time'); expect(paged).toContain('Typical activity by weekday and hour'); expect(paged).toContain('in one hour');
  });
  it('shows each combined five-hour winner with precise totals and exclusive dates across midnight', () => {
    const data: MetricsPeaks = { activeUsage: { status: 'insufficient-history', completedThrough: null, completedHours: 0, activeHours: 0, totalRequests: 0, actualCost: '0', hourly: null, fiveHourly: null }, usageTrend: { granularity: 'day', points: [] }, scope: 'all-time', reportingDate: '2026-09-15', generatedAt: '2026-09-15T07:00:00Z', timezone: 'Asia/Kolkata', coverage: { availableFrom: '2026-09-14T00:00:00Z', through: '2026-09-15T07:00:00Z', complete: false, basis: 'retained-api-history', storage: 'upstream', notice: 'Retained usage' }, fiveHourPeaks: { status: 'ready', eligibleWindows: 12, mostRequests: { startAt: '2026-09-14T16:30:00.000Z', endAt: '2026-09-14T21:30:00.000Z', requests: 11512, actualCost: '799.0302' }, highestSpend: { startAt: '2026-09-14T00:30:00.000Z', endAt: '2026-09-14T05:30:00.000Z', requests: 568, actualCost: '999.0302' } } };
    const render = (value = data, error?: Error) => renderToStaticMarkup(<PeakSection scope={value.scope} data={value} error={error} retry={() => {}} />);
    const html = render();
    for (const value of ['Most requests · 5 hours', 'Highest billed spend · 5 hours', '11,512', '$799.0302', '$999.0302', 'Sep 14, 2026', 'Sep 15, 2026', '10:00 PM', '3:00 AM', 'Asia/Kolkata', 'End times are exclusive', 'All customers combined']) expect(html).toContain(value);
    expect(html).toContain('dateTime="2026-09-14T21:30:00.000Z"');
    expect(render(data, new Error('offline'))).toContain('Showing the last successful report');
    const idle = render({ ...data, fiveHourPeaks: { ...data.fiveHourPeaks, mostRequests: null, highestSpend: null } });
    expect(idle).toContain('No requests in eligible'); expect(idle).toContain('No billed spend in eligible');
    expect(render({ ...data, fiveHourPeaks: { status: 'insufficient-history', eligibleWindows: 0, mostRequests: null, highestSpend: null } })).toContain('at least five consecutive');
    expect(render({ ...data, fiveHourPeaks: { status: 'unsupported-timezone', eligibleWindows: 0, mostRequests: null, highestSpend: null } })).toContain('daylight-saving or timezone clock change');
    expect(renderToStaticMarkup(<PeakSection scope="today" error={new Error('Usage unavailable')} retry={() => {}} />)).toContain('Usage unavailable');
    expect(renderToStaticMarkup(<PeakSection scope="all-time" retry={() => {}} />)).toContain('Loading all-time five-hour peaks');
  });
});
