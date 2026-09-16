import { Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dateInTimezone } from '@kineticrouter/analytics-client';
import { Activity, ChartNoAxesCombined, ChevronDown, ChevronRight, Monitor, RefreshCw, Users } from 'lucide-react';
import { metricsActivitySchema, metricsAveragesSchema, metricsOverviewSchema, metricsPeaksSchema, metricsUsersSchema, type MetricsActivity, type MetricsAverages, type MetricsBucket, type MetricsCoverage, type MetricsOverview, type MetricsPeaks, type MetricsQuery, type MetricsUsers, type PortalConfig } from '@kineticrouter/portal-contract';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatCard } from '../components/Ui';
import UsageDateRangePicker, { type UsageDateRange } from '../components/UsageDateRangePicker';
import { portalApi, PortalApiError, queryString } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatMoney } from '../lib/format';
import { currentMetricsSnapshot, watchMetricsDay } from '../lib/metrics-day';
import { initialMetricsControls, metricsControlsReducer, metricsReportParams, type ChartMetric, type MetricsView } from '../lib/metrics-controls';
import { CustomerMix, ExactMoney, MetricsTrend, metricsNumber as number, metricsPeriodLabel } from '../components/MetricsCharts';
import { MetricsActiveUsage } from '../components/MetricsActiveUsage';
import './metrics.css';

const tabs = [{ id: 'usage', label: 'Usage overview', icon: ChartNoAxesCombined }, { id: 'customers', label: 'Customers', icon: Users }, { id: 'activity', label: 'Activity', icon: Activity }] as const;
type Metric = ChartMetric;
const money = (value: string | number) => formatMoney(value, 4);
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export function metricsRange(days = 28, timezone = 'Asia/Kolkata', now = Date.now()): UsageDateRange {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const endDate = ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)!.value).join('-');
  return { startDate: new Date(Date.parse(endDate) - (days - 1) * 86400000).toISOString().slice(0, 10), endDate, label: `Last ${days} days` };
}
export function MetricsPage() {
  const { user } = useAuth(), client = useQueryClient();
  const [controls, dispatch] = useReducer(metricsControlsReducer, undefined, () => initialMetricsControls(metricsRange()));
  const { view, usage, customers: customerControls, activity: activityControls } = controls;
  const changeUsageMetric = useCallback((metric: ChartMetric) => dispatch({ type: 'usageMetric', metric: metric === 'requests' ? 'requests' : 'actualCost' }), []);
  const [search, setSearch] = useState(''), [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  const [denied, setDenied] = useState(false), deniedRef = useRef(false);
  const configuration = useQuery({ queryKey: ['config'], queryFn: () => portalApi<PortalConfig>('/config'), staleTime: 300000 });
  const timezone = configuration.data?.serverTimezone ?? 'Asia/Kolkata';
  const [clock, setClock] = useState(() => Date.now()), today = dateInTimezone(clock, timezone);
  useEffect(() => watchMetricsDay(timezone, setClock), [timezone]);
  useEffect(() => { dispatch({ type: 'timezone', range: metricsRange(28, timezone) }); }, [timezone]);
  useEffect(() => { const change = () => setVisible(document.visibilityState === 'visible'); document.addEventListener('visibilitychange', change); return () => document.removeEventListener('visibilitychange', change); }, []);
  useEffect(() => { const timer = setTimeout(() => setSearch(customerControls.input), 300); return () => clearTimeout(timer); }, [customerControls.input]);
  async function read<T>(kind: string, params: Record<string, string | number>, schema: { parse(value: unknown): T }, signal: AbortSignal) {
    try {
      const value = await portalApi<unknown>(`/admin/metrics/${kind}${queryString(params)}`, { signal }, params.range === 'all-time' || params.scope === 'all-time' ? 300000 : 60000);
      if (deniedRef.current) throw new Error('Administrator access is required.');
      try { return schema.parse(value); } catch { throw new PortalApiError({ status: 502, code: 'METRICS_VERSION_MISMATCH', message: 'Metrics could not be read. Reload after the console and backend have finished updating.' }); }
    } catch (error) {
      if (error instanceof PortalApiError && ([401, 403].includes(error.status) || error.code === 'ADMIN_VERIFICATION_UNAVAILABLE')) {
        deniedRef.current = true; setDenied(true);
        void client.cancelQueries({ queryKey: ['metrics'] }); client.removeQueries({ queryKey: ['metrics'] });
      }
      throw error;
    }
  }
  const enabled = visible && !denied && user?.role === 'admin' && user.status === 'active';
  function options<T>(owner: MetricsView, kind: string, params: Record<string, string | number>, schema: { parse(value: unknown): T }, interval = 60000) {
    return { enabled: enabled && view === owner, queryKey: ['metrics', user?.id, 'views-v3', owner, kind, timezone, today, params], queryFn: ({ signal }: { signal: AbortSignal }) => read(kind, params, schema, signal),
      retry: false as const, refetchInterval: interval, refetchIntervalInBackground: false, refetchOnWindowFocus: true, staleTime: interval - 5000 };
  }
  const usageParams = { scope: usage.scope, refresh: usage.refresh }, usageInterval = usage.scope === 'today' ? 60000 : 300000;
  const averages = useQuery(options('usage', 'averages', usageParams, metricsAveragesSchema, usageInterval));
  const peaks = useQuery(options('usage', 'peaks', usageParams, metricsPeaksSchema, usageInterval));
  const usageData = currentMetricsSnapshot(averages.data, timezone, Date.now(), usage.scope);
  const peakData = currentMetricsSnapshot(peaks.data, timezone, Date.now(), usage.scope);
  const customerParams = metricsReportParams(customerControls);
  const overview = useQuery(options('customers', 'overview', customerParams, metricsOverviewSchema));
  const customers = useQuery({ ...options('customers', 'users', { ...customerParams, cohort: customerControls.cohort, search, page: customerControls.page, pageSize: 25 }, metricsUsersSchema), enabled: enabled && view === 'customers' && search === customerControls.input });
  const activity = useQuery(options('activity', 'activity', { ...metricsReportParams(activityControls), source: activityControls.source, activityPage: activityControls.page }, metricsActivitySchema));
  const fetching = view === 'usage' ? averages.isFetching || peaks.isFetching : view === 'customers' ? overview.isFetching || customers.isFetching : activity.isFetching;
  const refresh = () => dispatch({ type: 'refresh', view, generation: Date.now() });
  if (denied) return <ErrorState error={new Error('Administrator access could not be verified. Metrics data has been cleared.')} retry={() => { deniedRef.current = false; setDenied(false); refresh(); }} />;
  const scopeLabel = usage.scope === 'today' ? 'Today' : 'All time';
  const dateControls = view === 'customers' ? customerControls : activityControls;
  return <div className="metrics-page">
    <PageHeader title="Metrics" description="Understand usage, customers and activity." action={<Badge tone="info">Admin only</Badge>} />
    <div className="metrics-page-meta"><span>Reporting timezone · {timezone}</span><span>Amounts in USD{!visible ? ' · Updates paused' : ''}</span></div>
    <MetricsTabs view={view} onChange={next => dispatch({ type: 'view', view: next })} />
    <section id={`metrics-panel-${view}`} role="tabpanel" aria-labelledby={`metrics-tab-${view}`} tabIndex={0} className="metrics-view">
      <div className="metrics-view-toolbar">
        <div><h2>{view === 'usage' ? `${scopeLabel} usage` : view === 'customers' ? 'Customers' : 'Activity'}</h2><p>{view === 'usage' ? usage.scope === 'today' ? 'From midnight to now. All customers combined.' : 'All available customer usage history.' : view === 'customers' ? 'See who uses the service and how much they consume.' : 'See when customers use the API and console.'}</p></div>
        <div className="metrics-actions">
          {view === 'usage' && <div className="metrics-segment" role="group" aria-label="Usage period">{(['today', 'all-time'] as const).map(scope => <button type="button" key={scope} aria-pressed={usage.scope === scope} onClick={() => dispatch({ type: 'usage', scope })}>{scope === 'today' ? 'Today' : 'All time'}</button>)}</div>}
          {view === 'activity' && <div className="metrics-segment" role="group" aria-label="Activity source">{(['api', 'console'] as const).map(source => <button type="button" key={source} aria-pressed={activityControls.source === source} onClick={() => dispatch({ type: 'source', source })}>{source === 'api' ? 'API' : 'Console'}</button>)}</div>}
          <Button variant="secondary" onClick={refresh} disabled={fetching}><RefreshCw size={15} className={fetching ? 'spin' : undefined} />Refresh {view === 'usage' ? 'usage' : view}</Button>
        </div>
      </div>
      {view !== 'usage' && <Card className="metrics-report-controls">
        <ReportingControls range={dateControls.range} allTime={dateControls.allTime} timezone={timezone} applyRange={range => dispatch({ type: 'dates', view, range })} selectAllTime={() => dispatch({ type: 'dates', view })} />
        <p>{dateControls.allTime ? 'All available history' : `${metricsPeriodLabel(dateControls.range.startDate)} – ${metricsPeriodLabel(dateControls.range.endDate)}`} · Applies to this {view === 'customers' ? 'Customers' : 'Activity'} view</p>
      </Card>}
      {view === 'usage' && <>
        <section className="metrics-block" aria-label="Recorded usage"><div className="metrics-block-heading"><div><h3>Recorded usage</h3><p>Actual billed spend and requests for {usage.scope === 'today' ? 'today' : 'all available history'}.</p></div><Badge tone="info">Actual</Badge></div>
          {usageData ? <RecordedUsage data={usageData} /> : averages.error ? <ReportError error={averages.error} retry={() => void averages.refetch()} /> : <LoadingState label="Loading recorded usage" />}
          {averages.error && usageData && <StaleNotice label="Usage totals" />}
          {peakData ? <><MetricsTrend trend={peakData.usageTrend} timezone={timezone} metric={usage.metric} onMetricChange={changeUsageMetric} /><Updated at={peakData.generatedAt} timezone={timezone} label="Chart updated" /></> : peaks.error ? <ReportError error={peaks.error} retry={() => void peaks.refetch()} /> : <LoadingState label="Loading recorded usage chart" />}
          {peaks.error && peakData && <StaleNotice label="Usage chart" />}
        </section>
        <section className="metrics-block metrics-active-block" aria-label="Active-hour averages"><div className="metrics-block-heading"><div><h3>Active-hour averages</h3><p>{usage.scope === 'today' ? 'Today’s' : 'All-time'} usage rate, excluding hours with no requests.</p></div><Badge tone="neutral">Calculated</Badge></div>
          {peakData ? <><MetricsActiveUsage data={peakData.activeUsage} timezone={timezone} /><Updated at={peakData.generatedAt} timezone={timezone} /></> : peaks.error ? <ReportError error={peaks.error} retry={() => void peaks.refetch()} /> : <LoadingState label="Loading active-hour averages" />}
          {peaks.error && peakData && <StaleNotice label="Active-hour averages" />}
        </section>
        <section className="metrics-block metrics-rates-block" aria-label="Overall averages"><div className="metrics-block-heading"><div><h3>Overall averages · Includes idle time</h3><p>{usage.scope === 'today' ? 'Uses all elapsed time today, including idle hours. The 7-day estimate uses only today’s data.' : 'Uses all elapsed time since the first available customer request, including idle hours.'}</p></div><Badge tone="neutral">Calculated</Badge></div>
          {usageData ? <AverageCards data={usageData} /> : <p className="metrics-window-empty">Rates will appear once recorded usage is available.</p>}
          {usageData && <Updated at={usageData.generatedAt} timezone={timezone} />}
          {averages.error && usageData && <StaleNotice label="Overall averages" />}
        </section>
        <PeakSection scope={usage.scope} data={peakData} error={peaks.error} retry={() => void peaks.refetch()} />
        {(peakData || usageData) && <Coverage value={(peakData ?? usageData)!.coverage} timezone={timezone} />}
      </>}
      {view === 'customers' && <>
        {overview.error && <ReportError error={overview.error} retry={() => void overview.refetch()} />}
        {overview.data ? <CustomerOverview data={overview.data} /> : !overview.error && <LoadingState label="Loading customer overview" />}
        <section className="metrics-block metrics-rankings" aria-label="Customer rankings"><div className="metrics-block-heading"><div><h3>Customer rankings</h3><p>Use the filters below to narrow this table.</p></div></div>
          <div className="metrics-user-controls"><label>Classification<select value={customerControls.cohort} onChange={event => dispatch({ type: 'customerFilters', cohort: event.target.value as MetricsQuery['cohort'] })}><option value="all">All customers</option><option value="heavy">Heavy</option><option value="light">Light</option><option value="regular">Regular</option><option value="none">No usage</option></select></label><label>Find a customer<input value={customerControls.input} onChange={event => dispatch({ type: 'customerFilters', input: event.target.value })} maxLength={100} placeholder="Name or email" /></label>{(customerControls.cohort !== 'all' || customerControls.input) && <Button variant="ghost" onClick={() => dispatch({ type: 'customerFilters', cohort: 'all', input: '' })}>Clear table filters</Button>}</div>
          {customers.error && <ReportError error={customers.error} retry={() => void customers.refetch()} />}
          {customers.data && search === customerControls.input ? <CustomerTable data={customers.data} page={customerControls.page} setPage={page => dispatch({ type: 'page', view: 'customers', page })} /> : !customers.error && <LoadingState label="Loading customer rankings" />}
        </section>
        {overview.data && <Coverage value={overview.data.coverage} timezone={timezone} />}
      </>}
      {view === 'activity' && <>
        {activity.error && <ReportError error={activity.error} retry={() => void activity.refetch()} />}
        {activity.data ? <ActivityView key={`${activityControls.source}:${activityControls.allTime}:${activityControls.range.startDate}:${activityControls.range.endDate}:${activity.data.pagination?.page ?? 1}`} data={activity.data} metric={activityControls.source === 'console' ? 'users' : activityControls.metric} setMetric={metric => dispatch({ type: 'activityMetric', metric })} setPage={page => dispatch({ type: 'page', view: 'activity', page })} /> : !activity.error && <LoadingState label="Loading activity" />}
      </>}
    </section>
  </div>;
}
export function MetricsTabs({ view, onChange }: { view: MetricsView; onChange(view: MetricsView): void }) {
  function key(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); onChange(tabs[next]!.id); document.getElementById(`metrics-tab-${tabs[next]!.id}`)?.focus(); }
  }
  return <div className="metrics-main-tabs" role="tablist" aria-label="Metrics views">{tabs.map((item, index) => <button type="button" key={item.id} id={`metrics-tab-${item.id}`} role="tab" aria-selected={view === item.id} aria-controls={`metrics-panel-${item.id}`} tabIndex={view === item.id ? 0 : -1} onKeyDown={event => key(event, index)} onClick={() => onChange(item.id)}><item.icon size={17} />{item.label}</button>)}</div>;
}
function ReportError({ error, retry }: { error: unknown; retry(): void }) {
  return <div className="error-state" role="alert"><div><strong>Couldn’t load this report</strong><p>{error instanceof Error ? error.message : 'Please try again.'}</p></div><Button variant="secondary" onClick={retry}>Try again</Button></div>;
}
function StaleNotice({ label }: { label: string }) { return <p className="metrics-notice" role="status">{label} could not be refreshed. Showing the last successful report.</p>; }
function Updated({ at, timezone, label = 'Updated' }: { at: string; timezone: string; label?: string }) { return <span className="metrics-average-updated">{label} <time dateTime={at}>{new Intl.DateTimeFormat('en', { timeZone: timezone, timeStyle: 'short' }).format(new Date(at))}</time></span>; }
function CustomerOverview({ data }: { data: MetricsOverview }) {
  return <>
    <div className="metrics-customer-summary">
      <StatCard label="Registered customers" value={number(data.totalUsers)} helper="Current accounts" icon={<Users size={19} />} />
      <Card className="metrics-dau-card"><h3>Customers active on {metricsPeriodLabel(data.dauDate)}</h3><div><span><Monitor size={16} />Console<strong>{data.consoleDau === null ? '—' : number(data.consoleDau)}</strong></span><span><Activity size={16} />API<strong>{data.apiDau === null ? '—' : number(data.apiDau)}</strong></span></div><p>Distinct customers on this date.</p></Card>
    </div>
    {data.consoleNotice && <p className="metrics-notice">{data.consoleNotice}</p>}
    <div className="metrics-customer-breakdown"><CustomerMix data={data} /><Card className="metrics-period-totals"><h3>Recorded usage for report dates</h3><p>{data.range.startDate ? `${metricsPeriodLabel(data.range.startDate)} – ${metricsPeriodLabel(data.range.endDate)}` : 'No available history'}</p><div><span>Billed spend</span><strong><ExactMoney value={data.actualCost} /></strong></div><div><span>Requests</span><strong>{number(data.requests)}</strong></div><Updated at={data.generatedAt} timezone={data.timezone} /></Card></div>
  </>;
}

export function ReportingControls({ range, allTime, timezone, applyRange, selectAllTime }: { range: UsageDateRange; allTime: boolean; timezone: string; applyRange(value: UsageDateRange): void; selectAllTime(): void }) {
  return <div className="metrics-range-controls"><span>Report dates</span><div className="metrics-presets" aria-label="Reporting presets">{[7, 28, 90].map(days => <button key={days} aria-pressed={!allTime && range.label === `Last ${days} days`} onClick={() => applyRange(metricsRange(days, timezone))}>{days} days</button>)}</div><UsageDateRangePicker calendarOnly value={allTime ? { ...range, label: 'Custom dates' } : range} timezone={timezone} onApply={applyRange} /><div className="metrics-presets"><button aria-pressed={allTime} onClick={selectAllTime}>All time</button></div></div>;
}

export function RecordedUsage({ data }: { data: MetricsAverages }) {
  const since = data.periodStart ? new Intl.DateTimeFormat('en', { timeZone: data.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.periodStart)) : null;
  return <>
    <div className="metrics-recorded-meta"><span>{data.scope === 'today' ? `${metricsPeriodLabel(data.reportingDate)} · Since midnight` : since ? `Available history since ${since}` : 'No customer API history is available yet.'}</span><Updated at={data.generatedAt} timezone={data.timezone} /></div>
    <div className="metrics-recorded-grid"><Card className="metrics-recorded-total"><h4>Billed spend</h4><strong><ExactMoney value={data.actualCost} /></strong></Card><Card className="metrics-recorded-total"><h4>Requests</h4><strong className="metrics-number">{number(data.totalRequests)}</strong></Card></div>
  </>;
}
export function AverageCards({ data }: { data: MetricsAverages }) {
  const isToday = data.scope === 'today', [duration, setDuration] = useState<5 | 168>(168);
  const cards = [
    { title: 'Average per hour', value: data.hourly },
    { title: isToday ? '5-hour estimate' : 'Average per 5 hours', value: data.fiveHourly },
    { title: isToday ? '7-day estimate' : 'Average per 7 days', value: data.weekly },
  ];
  const result = duration === 5 ? data.fiveHourly : data.weekly;
  return <>
    <p className="metrics-rate-basis">{isToday ? `Based on today’s ${number(data.elapsedHours)} elapsed hours` : `Based on ${number(data.elapsedHours / 24)} days of available history`} · Includes idle time</p>
    <div className="metrics-rate-grid">{cards.map(item => <Card className="metrics-rate-card" key={item.title}>
      <h4>{item.title}</h4><div className="metrics-rate-spend"><strong>{item.value ? <ExactMoney value={item.value.actualCost} /> : '—'}</strong><span>billed spend</span></div>
      <div className="metrics-rate-requests"><span>requests</span><b className="metrics-number">{item.value ? number(item.value.requests) : '—'}</b></div>
    </Card>)}</div>
    {data.elapsedHours === 0 && <p className="metrics-average-help">{isToday ? 'Averages begin once time has elapsed today.' : 'Averages will appear once usage history is available.'}</p>}
    <details className="metrics-disclosure metrics-calculation"><summary>How this is calculated</summary>
      <div className="metrics-calculation-heading"><p>{isToday ? 'This uses only today’s recorded usage, from midnight to the update time.' : 'This uses all recorded customer usage since the first available request.'}</p><label>Explain<select value={duration} onChange={event => setDuration(Number(event.target.value) as 5 | 168)}><option value={5}>5 hours</option><option value={168}>7 days</option></select></label></div>
      <ol className="metrics-calculation-flow" aria-label="Usage rate calculation">
        <li><span>Recorded usage</span><strong><ExactMoney value={data.actualCost} /></strong><small>{number(data.totalRequests)} requests</small></li>
        <li><span>Divided by elapsed time</span><strong>{number(data.elapsedHours)} <small>hours</small></strong><small>Including idle time</small></li>
        <li><span>Average per hour</span><strong>{data.hourly ? <ExactMoney value={data.hourly.actualCost} /> : '—'}</strong><small>{data.hourly ? number(data.hourly.requests) : '—'} requests / hour</small></li>
        <li><span>Multiplied by {duration} hours</span><strong>{result ? <ExactMoney value={result.actualCost} /> : '—'}</strong><small>{result ? number(result.requests) : '—'} requests / {duration === 5 ? '5 hours' : '7 days'}</small></li>
      </ol>
      <p>Seven days equals 168 hours. This is usage at the calculated average rate; it is not the total from the last seven days. Calculations use unrounded amounts and elapsed time.</p>
    </details>
  </>;
}
export function PeakSection({ scope, data, error, retry }: { scope: MetricsPeaks['scope']; data?: MetricsPeaks; error?: unknown; retry(): void }) {
  const label = scope === 'today' ? "Today's" : 'All-time';
  return <section className="metrics-block metrics-windows" aria-label={`${label} busiest five-hour usage`}>
    <div className="metrics-block-heading"><div><h3>Busiest actual periods</h3><p>{label} highest combined usage within a completed 5-hour period.</p></div><Badge tone="info">Actual</Badge></div>
    {data ? <PeakCards data={data} /> : error ? <ReportError error={error} retry={retry} /> : <LoadingState label={`Loading ${label.toLowerCase()} five-hour peaks`} />}
    {data && <><Updated at={data.generatedAt} timezone={data.timezone} /><details className="metrics-disclosure"><summary>About these periods</summary><p>All customers combined · Completed, hour-aligned five-hour periods · {data.timezone}. End times are exclusive. A window from 10 AM to 3 PM includes usage before 3 PM. Requests and spend can peak in different periods.</p></details></>}
    {data && !!error && <p className="metrics-notice" role="status">Five-hour peaks could not be refreshed. Showing the last successful report from today.</p>}
  </section>;
}
export function PeakCards({ data }: { data: MetricsPeaks }) {
  const peaks = data.fiveHourPeaks;
  if (peaks.status !== 'ready') return <p className="metrics-window-empty">{peaks.status === 'unsupported-timezone' ? 'Five-hour peaks are unavailable because this history includes a daylight-saving or timezone clock change that the hourly data cannot resolve.' : 'Five-hour peaks need at least five consecutive, fully covered, completed hours.'}</p>;
  const date = new Intl.DateTimeFormat('en', { timeZone: data.timezone, dateStyle: 'medium', timeStyle: 'short' });
  const cards = [{ title: 'Most requests · 5 hours', winner: peaks.mostRequests, empty: 'No requests in eligible five-hour periods.' }, { title: 'Highest billed spend · 5 hours', winner: peaks.highestSpend, empty: 'No billed spend in eligible five-hour periods.' }];
  return <div className="metrics-window-grid">{cards.map(({ title, winner, empty }) => <Card className="metrics-window-card" key={title}>
    <h4>{title}</h4>
    {winner ? <>
      <div className="metrics-window-values"><div><strong className="metrics-number">{number(winner.requests)}</strong><span>requests</span></div><div><strong><ExactMoney value={winner.actualCost} /></strong><span>billed spend</span></div></div>
      <p className="metrics-window-period"><time dateTime={winner.startAt}>{date.format(new Date(winner.startAt))}</time><span aria-hidden="true"> → </span><time dateTime={winner.endAt}>{date.format(new Date(winner.endAt))}</time></p>
    </> : <p className="metrics-window-empty">{empty}</p>}
  </Card>)}</div>;
}
function Coverage({ value, timezone }: { value: MetricsCoverage; timezone: string }) {
  return <div className="metrics-coverage"><p>{value.availableFrom ? `Available from ${new Intl.DateTimeFormat('en', { timeZone: timezone, dateStyle: 'medium' }).format(new Date(value.availableFrom))}. ` : 'No history is available. '}{value.basis === 'retained-api-history' ? 'Based on retained usage; deleted records may be missing.' : 'Observed console activity; collection is best effort.'}</p><details className="metrics-disclosure"><summary>Data coverage details</summary><p>{value.notice}{value.storage === 'memory' && <strong> Development history resets when the backend restarts.</strong>}</p></details></div>;
}
function CustomerTable({ data, page, setPage }: { data: MetricsUsers; page: number; setPage(page: number): void }) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return <><p className="metrics-chart-note">{number(data.total)} matching customers · Ranked by requests and billed spend</p>{data.items.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Customer</th><th>Status</th><th>Requests</th><th>Billed spend</th><th>Classification</th></tr></thead><tbody>{data.items.map(row => <tr key={row.id}><td><span className="metrics-customer"><strong>{row.username || row.email}</strong><small>{row.email}</small></span></td><td>{row.status}</td><td>{number(row.requests)}</td><td>{money(row.actualCost)}</td><td><Badge tone={row.cohort === 'heavy' ? 'info' : row.cohort === 'light' ? 'success' : 'neutral'}>{row.cohort === 'none' ? 'No usage' : row.cohort[0]!.toUpperCase() + row.cohort.slice(1)}</Badge></td></tr>)}</tbody></table></div> : <EmptyState title="No customers match" description="Try a different classification or search." />}
    <div className="pagination"><span>Page {page} of {pages}</span><div className="metrics-actions"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></div></div>
  </>;
}
export function ActivityView({ data, setPage, metric: controlledMetric, setMetric: changeMetric }: { data: MetricsActivity; setPage?(page: number): void; metric?: Metric; setMetric?(metric: Metric): void }) {
  const [localMetric, setLocalMetric] = useState<Metric>('users');
  const metric = data.source === 'console' ? 'users' : controlledMetric ?? localMetric;
  const setMetric = changeMetric ?? setLocalMetric;
  const [expanded, setExpanded] = useState(() => new Set(data.weeks.length ? [`week:${data.weeks[data.weeks.length - 1]!.period}`] : []));
  function toggle(key: string) { setExpanded(old => { const next = new Set(old); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }
  return <div className="metrics-activity">
    <div className="metrics-peak-grid"><Card><span>Most active customers in one hour</span><strong>{data.peakUsers ? `${number(data.peakUsers.users)} users` : 'No complete-hour activity'}</strong><small>{data.peakUsers ? metricsPeriodLabel(data.peakUsers.period) : 'Completed hours will appear here.'}</small></Card>{data.source === 'api' && <Card><span>Highest API request volume in one hour</span><strong>{data.peakRequests ? `${number(data.peakRequests.requests)} requests` : 'No complete-hour activity'}</strong><small>{data.peakRequests ? metricsPeriodLabel(data.peakRequests.period) : 'Completed hours will appear here.'}</small></Card>}</div>
    <section className="metrics-block metrics-activity-charts" aria-label="Activity charts"><div className="metrics-block-heading"><div><h3>Activity charts</h3><p>{data.range.mode === 'all-time' ? 'All available history' : `${metricsPeriodLabel(data.range.startDate!)} – ${metricsPeriodLabel(data.range.endDate)}`} · {data.source === 'api' ? 'API' : 'Console'}</p></div>{data.source === 'api' && <label className="metrics-measure">Chart measure<select value={metric} onChange={event => setMetric(event.target.value as Metric)}><option value="users">Active customers</option><option value="requests">Requests</option><option value="actualCost">Billed spend</option></select></label>}</div>
    <MetricsTrend trend={data.usageTrend} timezone={data.timezone} title="Recorded activity over time" metric={metric} allowUsers usersOnly={data.source === 'console'} />
    <MetricsHeatmap cells={data.heatmap} metric={metric} timezone={data.timezone} /></section>
    <Card className="table-card"><div className="table-card-title"><div><h3>{data.source === 'api' ? 'API activity' : 'Console activity'} by period</h3><p>Expand a week to see days, then expand a day to see hours.</p>{data.pagination && <p>This table shows 13 weeks per page. Charts and peaks cover all available history.</p>}</div></div><div className="data-table-wrap"><table className="data-table metrics-period-table"><thead><tr><th>Period · {data.timezone}</th><th>Active customers</th>{data.source === 'api' && <><th>Requests</th><th>Billed spend</th></>}</tr></thead><tbody><PeriodRows rows={data.weeks} expanded={expanded} toggle={toggle} api={data.source === 'api'} /></tbody></table></div>
      {data.pagination && <div className="pagination"><span>Page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.totalWeeks} weeks{data.pagination.startDate ? ` · ${data.pagination.startDate} → ${data.pagination.endDate}` : ''}</span><div className="metrics-actions"><Button variant="secondary" disabled={data.pagination.page <= 1} onClick={() => setPage?.(data.pagination!.page - 1)}>Newer weeks</Button><Button variant="secondary" disabled={data.pagination.page >= data.pagination.totalPages} onClick={() => setPage?.(data.pagination!.page + 1)}>Older weeks</Button></div></div>}
      <Coverage value={data.coverage} timezone={data.timezone} /></Card>
  </div>;
}
function MetricsHeatmap({ cells, metric, timezone }: { cells: MetricsActivity['heatmap']; metric: Metric; timezone: string }) {
  const [selected, setSelected] = useState<number>();
  const maximum = useMemo(() => Math.max(0, ...cells.map(cell => Number(cell[metric]))), [cells, metric]);
  const active = selected === undefined ? undefined : cells[selected];
  const label = metric === 'users' ? 'active users' : metric === 'requests' ? 'requests' : 'billed spend';
  const value = (row: typeof cells[number]) => metric === 'actualCost' ? money(row.actualCost) : number(row[metric]);
  const rows = useMemo(() => weekdays.map((_, weekday) => cells.filter(cell => cell.weekday === weekday)), [cells]);
  return <Card className="metrics-heatmap-card"><div className="metrics-section-heading"><div><h3>Typical activity by weekday and hour</h3><p>Average {label} across completed hours · {timezone}</p></div></div>
      <div className="metrics-heatmap-scroll"><div className="metrics-heatmap"><span />{Array.from({ length: 24 }, (_, hour) => <span className="metrics-hour-label" key={hour}>{String(hour).padStart(2, '0')}</span>)}{weekdays.map((day, weekday) => <Fragment key={day}><span className="metrics-day-label">{day.slice(0, 3)}</span>{rows[weekday]!.map(cell => { const index = cell.weekday * 24 + cell.hour; return <button key={cell.hour} className={`metrics-heat-cell${cell.occurrences ? '' : ' unavailable'}`} style={{ '--heat': cell.occurrences && maximum ? .12 + .88 * Number(cell[metric]) / maximum : .06 } as CSSProperties} aria-label={`${day} ${String(cell.hour).padStart(2, '0')}:00: ${cell.occurrences ? `${value(cell)} average ${label}, ${cell.occurrences} complete hours` : 'unavailable'}`} aria-pressed={selected === index} onFocus={() => setSelected(index)} onClick={() => setSelected(index)} />; })}</Fragment>)}</div></div>
      <div className="metrics-heatmap-detail" aria-live="polite">{active ? `${weekdays[active.weekday]} ${String(active.hour).padStart(2, '0')}:00 · ${active.occurrences ? `${value(active)} average ${label} across ${active.occurrences} complete hours` : 'No complete covered hours'}` : 'Select an hour to inspect its average. Stronger color indicates more activity.'}</div><p className="metrics-heatmap-note">Idle hours are included. Incomplete and unavailable hours are excluded from the averages and peak periods.</p>
      <div className="metrics-heatmap-legend"><span>Lower</span><i /><span>Higher activity</span></div>
    </Card>;
}

function PeriodRows({ rows, expanded, toggle, api }: { rows: MetricsBucket[]; expanded: Set<string>; toggle(key: string): void; api: boolean }) {
  return <>{rows.map(row => { const key = `${row.level}:${row.period}`, open = expanded.has(key), label = row.level === 'week' ? `Week of ${row.period}` : row.level === 'hour' ? row.period.slice(11) : row.period;
    return <Fragment key={key}><tr className={`metrics-period-${row.level}`}><td>{row.children.length ? <button className="metrics-expand" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`} onClick={() => toggle(key)}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<span>{label}</span></button> : <span className="metrics-hour-value">{label}</span>}{!row.covered ? <small className="metrics-period-note">Unavailable</small> : row.partial && <small className="metrics-period-note">Partial period</small>}</td><td>{row.covered ? number(row.users) : '—'}</td>{api && <><td>{row.covered ? number(row.requests) : '—'}</td><td>{row.covered ? money(row.actualCost) : '—'}</td></>}</tr>{open && <PeriodRows rows={row.children} expanded={expanded} toggle={toggle} api={api} />}</Fragment>;
  })}</>;
}
