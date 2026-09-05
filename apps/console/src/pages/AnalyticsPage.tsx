import { lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ArrowDownToLine, ArrowUpRight, Clock3, Eye, Globe2, MousePointer2, RefreshCw, Users, Zap } from 'lucide-react';
import type { AnalyticsAcquisition, AnalyticsActions, AnalyticsBreakdown, AnalyticsLive, AnalyticsOverview, AnalyticsPages, AnalyticsPerformance, AnalyticsScope, PortalConfig } from '@kineticrouter/portal-contract';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatCard } from '../components/Ui';
import UsageDateRangePicker, { getUsagePresetRange } from '../components/UsageDateRangePicker';
import { portalApi, PortalApiError, queryString } from '../lib/api';
import { csvCell } from '../lib/csv';

const AnalyticsTrend = lazy(() => import('../components/AnalyticsTrend'));
const tabs = [{ id: 'live', label: 'Live', icon: Activity }, { id: 'traffic', label: 'Traffic', icon: Globe2 }, { id: 'acquisition', label: 'Acquisition & actions', icon: MousePointer2 }, { id: 'performance', label: 'Performance', icon: Zap }] as const;
type Tab = typeof tabs[number]['id'];
const number = (value: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(value);
const duration = (ms: number) => ms >= 60_000 ? `${Math.floor(ms / 60_000)}m ${Math.round(ms % 60_000 / 1000)}s` : `${Math.round(ms / 1000)}s`;
const actionLabels: Record<string, string> = { cta_click: 'Console CTA clicks', docs_copy: 'Documentation copies', sign_in: 'Successful sign-ins', api_key_created: 'API keys created', redemption: 'Successful redemptions' };
const delta = (current: number, previous: number, available: boolean) => !available ? 'Earlier period is outside retained history' : previous === 0 ? current ? 'No traffic in the previous period' : 'No change from previous period' : `${current >= previous ? '+' : ''}${((current - previous) / previous * 100).toFixed(1)}% vs previous period`;

export function AnalyticsPage() {
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>('live');
  const [surface, setSurface] = useState<AnalyticsScope>('all');
  const [range, setRange] = useState(() => getUsagePresetRange('last-7-days'));
  const [page, setPage] = useState(1);
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  const [denied, setDenied] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const exportController = useRef<AbortController | null>(null);
  useEffect(() => () => exportController.current?.abort(), []);
  const configuration = useQuery({ queryKey: ['config'], queryFn: () => portalApi<PortalConfig>('/config'), staleTime: 300_000 });
  const timezone = configuration.data?.serverTimezone ?? 'Asia/Kolkata';
  useEffect(() => { const changed = () => setVisible(document.visibilityState === 'visible'); document.addEventListener('visibilitychange', changed); return () => document.removeEventListener('visibilitychange', changed); }, []);
  useEffect(() => { const timer = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350); return () => clearTimeout(timer); }, [searchInput]);
  const filters = { startDate: range.startDate, endDate: range.endDate, surface };
  async function read<T>(kind: string, params: Record<string, string | number>, signal?: AbortSignal) {
    try { return await portalApi<T>(`/admin/analytics/${kind}${queryString(params)}`, { signal }); }
    catch (error) {
      if (error instanceof PortalApiError && [401, 403].includes(error.status)) {
        setDenied(true); void client.cancelQueries({ queryKey: ['analytics'] }); client.removeQueries({ queryKey: ['analytics'] });
        exportController.current?.abort();
      }
      throw error;
    }
  }
  const base = { enabled: visible && !denied, retry: false as const, refetchIntervalInBackground: false, refetchOnWindowFocus: true, placeholderData: keepPreviousData };
  const live = useQuery({ ...base, queryKey: ['analytics', 'live', surface, page], queryFn: ({ signal }) => read<AnalyticsLive>('live', { surface, page, pageSize: 25 }, signal), enabled: base.enabled && tab === 'live', refetchInterval: 10_000, staleTime: 8000 });
  const overview = useQuery({ ...base, queryKey: ['analytics', 'overview', filters], queryFn: ({ signal }) => read<AnalyticsOverview>('overview', filters, signal), enabled: base.enabled && tab === 'traffic', refetchInterval: 60_000, staleTime: 55_000 });
  const pages = useQuery({ ...base, queryKey: ['analytics', 'pages', filters, page, search], queryFn: ({ signal }) => read<AnalyticsPages>('pages', { ...filters, page, pageSize: 25, search }, signal), enabled: base.enabled && tab === 'traffic', refetchInterval: 60_000, staleTime: 55_000 });
  const acquisition = useQuery({ ...base, queryKey: ['analytics', 'acquisition', filters], queryFn: ({ signal }) => read<AnalyticsAcquisition>('acquisition', filters, signal), enabled: base.enabled && tab === 'acquisition', refetchInterval: 60_000, staleTime: 55_000 });
  const actions = useQuery({ ...base, queryKey: ['analytics', 'actions', filters], queryFn: ({ signal }) => read<AnalyticsActions>('actions', filters, signal), enabled: base.enabled && tab === 'acquisition', refetchInterval: 60_000, staleTime: 55_000 });
  const performance = useQuery({ ...base, queryKey: ['analytics', 'performance', filters], queryFn: ({ signal }) => read<AnalyticsPerformance>('performance', filters, signal), enabled: base.enabled && tab === 'performance', refetchInterval: 60_000, staleTime: 55_000 });
  const selected = tab === 'live' ? live : tab === 'traffic' ? overview : tab === 'acquisition' ? acquisition : performance;
  const updated = selected.dataUpdatedAt ? new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: timezone }).format(selected.dataUpdatedAt) : 'Waiting for data';
  function selectTab(next: Tab) { setTab(next); setPage(1); setExportMessage(''); }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault(); selectTab(tabs[next]!.id); document.getElementById(`analytics-tab-${tabs[next]!.id}`)?.focus();
  }
  async function exportReport() {
    exportController.current?.abort();
    const controller = new AbortController(); exportController.current = controller;
    setExporting(true); setExportMessage('');
    try {
      let rows: unknown[][] = [];
      if (tab === 'traffic') {
        rows = [['Surface', 'Page', 'Visitors', 'Pageviews', 'Engagement (ms)', 'Entrances', 'Exits']];
        let current = 1, total = 0;
        do {
          const data = await read<AnalyticsPages>('pages', { ...filters, search, page: current, pageSize: 100 }, controller.signal); total = data.total;
          rows.push(...data.items.map(item => [item.surface, item.path, item.visitors, item.pageviews, item.engagementMs, item.entrances, item.exits])); current++;
        } while (rows.length - 1 < total && current <= 100);
        if (total > 10_000) setExportMessage('Exported the first 10,000 pages. Narrow the report to export more.');
      } else if (tab === 'acquisition') {
        const [sources, events] = await Promise.all([read<AnalyticsAcquisition>('acquisition', filters, controller.signal), read<AnalyticsActions>('actions', filters, controller.signal)]);
        rows = [['Report', 'Dimension / action', 'Visitors / events', 'Sessions']];
        for (const [key, values] of Object.entries(sources)) rows.push(...values.map(item => [key, item.label, item.visitors, item.sessions]));
        rows.push(...events.actions.map(item => ['actions', actionLabels[item.name], item.count, item.sessions]));
      } else {
        const data = await read<AnalyticsPerformance>('performance', filters, controller.signal);
        rows = [['Surface', 'Page', 'Metric', '75th percentile', 'Samples', 'Rating'], ...data.items.map(item => [item.surface, item.path, item.metric, item.p75, item.samples, item.rating])];
      }
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `kineticrouter-${tab}-${range.startDate}-${range.endDate}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { if (!controller.signal.aborted) setExportMessage(error instanceof Error ? error.message : 'Export failed.'); }
    finally { if (!controller.signal.aborted) setExporting(false); }
  }
  if (denied) return <ErrorState error={new Error('Administrator access is required. Analytics data has been cleared.')} />;
  return <div className="analytics-page">
    <PageHeader title="Analytics" description="Understand how people discover and use kineticRouter." action={<div className="analytics-header-actions"><Badge tone="info">Admin only</Badge><Button variant="secondary" onClick={() => void client.invalidateQueries({ queryKey: ['analytics'] })} aria-label="Refresh analytics"><RefreshCw size={16} /></Button>{tab !== 'live' && <Button variant="secondary" disabled={exporting || !selected.data} onClick={() => void exportReport()}><ArrowDownToLine size={16} />{exporting ? 'Exporting…' : 'Export CSV'}</Button>}</div>} />
    <Card className="toolbar-card analytics-toolbar">
      <label className="analytics-control">Surface<select className="compact-select" value={surface} onChange={event => { setSurface(event.target.value as AnalyticsScope); setPage(1); }}><option value="all">Website + console</option><option value="site">Public website</option><option value="console">Customer console</option></select></label>
      {tab !== 'live' ? <UsageDateRangePicker calendarOnly value={range} timezone={timezone} onApply={value => { setRange(value); setPage(1); }} /> : <span className="analytics-window"><span className="analytics-live-dot" />Seen in the last 90 seconds</span>}
      <span className="analytics-updated">{selected.isFetching ? 'Updating…' : `Updated ${updated}`}<small>{timezone}{!visible ? ' · Updates paused' : ''}</small></span>
    </Card>
    <div className="analytics-tabs" role="tablist" aria-label="Analytics reports">{tabs.map((item, index) => <button key={item.id} id={`analytics-tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls={`analytics-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onKeyDown={event => tabKey(event, index)} onClick={() => selectTab(item.id)}><item.icon size={16} />{item.label}</button>)}</div>
    {exportMessage && <p className="analytics-notice" role="status">{exportMessage}</p>}
    {selected.error && selected.data && <p className="analytics-notice" role="status">Updates are unavailable. Showing the last successful report.</p>}
    <section id={`analytics-panel-${tab}`} role="tabpanel" aria-labelledby={`analytics-tab-${tab}`} tabIndex={0}>
      {!selected.data ? selected.error ? <ErrorState error={selected.error} retry={() => void selected.refetch()} /> : <LoadingState label="Loading analytics" /> : <>
        {tab === 'live' && live.data && <>
          <div className="stats-grid compact"><StatCard label="Active visitors" value={number(live.data.visitors)} helper="Distinct browsers" icon={<Users size={19} />} /><StatCard label="Signed-in customers" value={number(live.data.customers)} helper="Across tabs and devices" icon={<Activity size={19} />} /><StatCard label="Active tabs" value={number(live.data.activeTabs)} helper="Visible pages" icon={<Eye size={19} />} /><StatCard label="Pages active now" value={number(live.data.pages.length)} helper="Website and console" icon={<Globe2 size={19} />} /></div>
          {!live.data.health.storageAvailable && <p className="analytics-notice" role="status">Historical storage is unavailable. Live activity can still update.</p>}
          <TableCard title="People online" subtitle="Customers appear once, on their most recently visible page." empty={!live.data.total} emptyText="New visitors will appear here as they browse."><table className="data-table"><thead><tr><th>Visitor</th><th>Current page</th><th>Device</th><th>Tabs</th><th>Last seen</th></tr></thead><tbody>{live.data.items.map(item => <tr key={item.id}><td><span className="analytics-person"><span className={`analytics-avatar ${item.authenticated ? 'identified' : ''}`}>{item.authenticated ? item.label.slice(0, 1).toUpperCase() : <Users size={15} />}</span><span>{item.label}<small>{item.authenticated ? 'Signed-in customer' : 'Anonymous visitor'}</small></span></span></td><td><PageLabel surface={item.surface} path={item.path} /></td><td>{item.device}</td><td>{item.tabs}</td><td>{new Intl.DateTimeFormat('en', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(item.lastSeen))}</td></tr>)}</tbody></table><Pagination page={page} total={live.data.total} pageSize={25} setPage={setPage} /></TableCard>
          <div className="analytics-grid"><TableCard title="Busiest pages right now" empty={!live.data.pages.length} emptyText="Active pages will appear as visitors arrive."><table className="data-table"><thead><tr><th>Page</th><th>Visitors</th><th>Tabs</th></tr></thead><tbody>{live.data.pages.slice(0, 10).map(item => <tr key={`${item.surface}:${item.path}`}><td><PageLabel surface={item.surface} path={item.path} /></td><td>{item.visitors}</td><td>{item.tabs}</td></tr>)}</tbody></table></TableCard><Card className="analytics-health"><div className="card-heading"><h2>Collection health</h2><Badge tone={live.data.health.storageAvailable ? 'success' : 'warning'}>{live.data.health.storageAvailable ? 'Collection ready' : 'Storage unavailable'}</Badge></div><dl><div><dt>Accepted observations</dt><dd>{number(live.data.health.collected)}</dd></div><div><dt>Rejected requests</dt><dd>{number(live.data.health.rejected)}</dd></div><div><dt>Uncommitted observations</dt><dd>{number(live.data.health.dropped)}</dd></div></dl><p>Administrator visits and known bots are excluded. Browser privacy signals do not disable collection. Counts are since the backend last started.</p></Card></div>
        </>}
        {tab === 'traffic' && overview.data && <>
          {overview.data.storage === 'memory' && <p className="analytics-notice">Development storage: this history resets when the backend restarts.</p>}
          <div className="stats-grid compact"><StatCard label="Visitors" value={number(overview.data.totals.visitors)} helper={delta(overview.data.totals.visitors, overview.data.previous.visitors, overview.data.range.comparisonAvailable)} icon={<Users size={19} />} /><StatCard label="Sessions" value={number(overview.data.totals.sessions)} helper={delta(overview.data.totals.sessions, overview.data.previous.sessions, overview.data.range.comparisonAvailable)} icon={<Activity size={19} />} /><StatCard label="Pageviews" value={number(overview.data.totals.pageviews)} helper={delta(overview.data.totals.pageviews, overview.data.previous.pageviews, overview.data.range.comparisonAvailable)} icon={<Eye size={19} />} /><StatCard label="Engagement rate" value={`${overview.data.totals.engagementRate.toFixed(1)}%`} helper={`${overview.data.totals.bounceRate.toFixed(1)}% bounce rate`} icon={<MousePointer2 size={19} />} /></div>
          <Card className="usage-main-chart"><div className="card-heading"><div><h2>Traffic over time</h2><p>Daily visitors and pageviews</p></div><span className="analytics-chart-key"><i />Visitors <b />Pageviews</span></div><Suspense fallback={<LoadingState label="Loading chart" />}><AnalyticsTrend data={overview.data.trend} /></Suspense><details className="analytics-data-disclosure"><summary>View daily numbers</summary><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Visitors</th><th>Sessions</th><th>Pageviews</th></tr></thead><tbody>{overview.data.trend.map(row => <tr key={row.date}><td>{row.date}</td><td>{number(row.visitors)}</td><td>{number(row.sessions)}</td><td>{number(row.pageviews)}</td></tr>)}</tbody></table></div></details></Card>
          <div className="analytics-summary-strip"><span><strong>{number(overview.data.totals.newVisitors)}</strong>New visitors</span><span><strong>{number(overview.data.totals.returningVisitors)}</strong>Returning visitors</span><span><strong>{duration(overview.data.totals.averageEngagementMs)}</strong>Average session engagement</span><span><Clock3 size={17} />Sessions expire after 30 minutes without activity.</span></div>
          <Card className="analytics-page-search"><label>Find a page<input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Search by path, e.g. /docs or /models" maxLength={100} /></label></Card>
          {pages.error ? <ErrorState error={pages.error} retry={() => void pages.refetch()} /> : pages.data ? <TableCard title="Top pages" subtitle="Ranked by pageviews. Entrances and exits show where sessions begin and end." empty={!pages.data.total} emptyText="Page traffic will appear after collection begins."><table className="data-table"><thead><tr><th>Page</th><th>Views</th><th>Visitors</th><th>Engagement</th><th>Entrances</th><th>Exits</th></tr></thead><tbody>{pages.data.items.map(item => <tr key={`${item.surface}:${item.path}`}><td><PageLabel surface={item.surface} path={item.path} /></td><td>{number(item.pageviews)}</td><td>{number(item.visitors)}</td><td>{duration(item.engagementMs)}</td><td>{number(item.entrances)}</td><td>{number(item.exits)}</td></tr>)}</tbody></table><Pagination page={page} total={pages.data.total} pageSize={25} setPage={setPage} /></TableCard> : <LoadingState label="Loading pages" />}
        </>}
        {tab === 'acquisition' && acquisition.data && <div className="analytics-grid">
          <Breakdown title="Referring websites" rows={acquisition.data.referrers} /><Breakdown title="Source / medium" rows={acquisition.data.sources} /><Breakdown title="Campaigns" rows={acquisition.data.campaigns} />
          {actions.error ? <ErrorState error={actions.error} retry={() => void actions.refetch()} /> : actions.data && <TableCard title="Product actions" subtitle="Sign-ins, key creation, and redemption count confirmed successes." empty={!actions.data.actions.some(item => item.count)} emptyText="Product actions will appear as visitors use the site."><table className="data-table"><thead><tr><th>Action</th><th>Events</th><th>Sessions</th></tr></thead><tbody>{actions.data.actions.map(item => <tr key={item.name}><td>{actionLabels[item.name]}</td><td>{number(item.count)}</td><td>{number(item.sessions)}</td></tr>)}</tbody></table></TableCard>}
          {actions.data && <Card className="analytics-wide analytics-funnel"><div className="card-heading"><div><h2>From discovery to an API key</h2><p>Ordered steps in the same session and selected dates. Existing customers can skip this journey.</p></div><ArrowUpRight size={19} /></div>{!actions.data.funnelAvailable ? <p>Select Website + console to view the cross-site funnel.</p> : <div className="analytics-funnel-steps">{actions.data.funnel.map((step, index) => { const first = actions.data!.funnel[0]!.sessions; const percent = first ? step.sessions / first * 100 : 0; return <div key={step.name}><span>0{index + 1} / {step.name}</span><strong>{number(step.sessions)}</strong><div className="analytics-bar"><i style={{ width: `${percent}%` }} /></div><small>{percent.toFixed(1)}% of sessions with a CTA click</small></div>; })}</div>}</Card>}
          <Breakdown title="Devices" rows={acquisition.data.devices} /><Breakdown title="Browsers" rows={acquisition.data.browsers} /><Breakdown title="Operating systems" rows={acquisition.data.operatingSystems} />
        </div>}
        {tab === 'performance' && performance.data && <>
          <div className="analytics-performance-guide"><Card><Zap size={20} /><h2>Loading · LCP</h2><strong>Good at ≤ 2.5 seconds</strong><p>When the main content becomes visible.</p></Card><Card><MousePointer2 size={20} /><h2>Responsiveness · INP</h2><strong>Good at ≤ 200 ms</strong><p>How quickly the page responds to an interaction.</p></Card><Card><Eye size={20} /><h2>Visual stability · CLS</h2><strong>Good at ≤ 0.1</strong><p>How much content shifts unexpectedly.</p></Card></div>
          <TableCard title="Real visitor performance" subtitle="75th percentile, by document page. Up to 100 measured page/metric combinations; unsupported metrics are omitted." empty={!performance.data.items.length} emptyText="Measurements will appear after visitors interact with pages or switch tabs."><table className="data-table"><thead><tr><th>Page</th><th>Metric</th><th>75th percentile</th><th>Samples</th><th>Rating</th></tr></thead><tbody>{performance.data.items.map(item => <tr key={`${item.surface}:${item.path}:${item.metric}`}><td><PageLabel surface={item.surface} path={item.path} /></td><td>{item.metric}</td><td>{item.metric === 'CLS' ? item.p75.toFixed(3) : `${number(item.p75)} ms`}</td><td>{number(item.samples)}{item.samples < 20 && <small className="analytics-small-sample">Small sample</small>}</td><td><Badge tone={item.rating === 'good' ? 'success' : item.rating === 'poor' ? 'danger' : 'warning'}>{item.rating.replaceAll('-', ' ')}</Badge></td></tr>)}</tbody></table></TableCard>
        </>}
      </>}
    </section>
  </div>;
}

function PageLabel({ surface, path }: { surface: string; path: string }) { return <span className="analytics-page-cell" title={path}><small>{surface === 'site' ? 'Website' : 'Console'}</small><span>{path}</span></span>; }
function TableCard({ title, subtitle, children, empty, emptyText }: { title: string; subtitle?: string; children: ReactNode; empty?: boolean; emptyText?: string }) { return <Card className="table-card analytics-table"><div className="table-card-title"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>{empty ? <EmptyState title="No activity yet" description={emptyText ?? 'Activity will appear as people use the site.'} /> : <div className="data-table-wrap">{children}</div>}</Card>; }
function Pagination({ page, total, pageSize, setPage }: { page: number; total: number; pageSize: number; setPage(page: number): void }) { const pages = Math.max(1, Math.ceil(total / pageSize)); return <div className="pagination"><span>{number(total)} results · Page {page} of {pages}</span><div className="analytics-header-actions"><Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></div></div>; }
function Breakdown({ title, rows }: { title: string; rows: AnalyticsBreakdown[] }) { return <TableCard title={title} subtitle="Top 100 by sessions" empty={!rows.length}><table className="data-table"><thead><tr><th>Name</th><th>Visitors</th><th>Sessions</th></tr></thead><tbody>{rows.map(row => <tr key={row.label}><td className="analytics-dimension-cell">{row.label}</td><td>{number(row.visitors)}</td><td>{number(row.sessions)}</td></tr>)}</tbody></table></TableCard>; }
