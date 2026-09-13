import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Activity, Coins, Download, Percent, RefreshCw, Search, Timer, Zap } from 'lucide-react';
import { usageSummarySchema, type Paginated, type UsageEvent } from '@kineticrouter/portal-contract';
import type { DistributionItem } from '../components/UsageDistributionCard';
import { ProviderIcon } from '../components/ProviderIcon';
import UsageDateRangePicker, { getDefaultUsageRange, type UsageDateRange } from '../components/UsageDateRangePicker';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatCard } from '../components/Ui';
import { PortalApiError, portalApi, queryString } from '../lib/api';
import { csvCell } from '../lib/csv';
import { formatDate, formatLatency, formatMoney, formatNumber } from '../lib/format';
import { publicSiteHref } from '../lib/public-site';

function loadOnce<T>(load: () => Promise<T>) {
  let pending: Promise<T> | undefined;
  return () => pending ??= load();
}
const loadUsageChart = loadOnce(() => import('../components/UsageChart'));
const loadDistribution = loadOnce(() => import('../components/UsageDistributionCard'));
const loadTokenTrend = loadOnce(() => import('../components/TokenUsageTrend'));
const UsageChart = lazy(loadUsageChart);
const UsageDistributionCard = lazy(loadDistribution);
const TokenUsageTrend = lazy(loadTokenTrend);

export function UsagePage() {
  useEffect(() => {
    // Download alongside the queries. Lazy rendering retains the existing error boundary.
    void Promise.all([loadUsageChart(), loadDistribution(), loadTokenTrend()]).catch(() => {});
  }, []);
  const [range, setRange] = useState<UsageDateRange>(getDefaultUsageRange);
  const [page, setPage] = useState(1);
  const [model, setModel] = useState('');
  const [requestType, setRequestType] = useState('');
  const [billingMode, setBillingMode] = useState('');
  const summary = useQuery({
    queryKey: ['usage-summary', range.startDate, range.endDate],
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const data = await portalApi<unknown>(`/usage/summary${queryString({ startDate: range.startDate, endDate: range.endDate })}`, { signal });
      const parsed = usageSummarySchema.safeParse(data);
      if (!parsed.success) {
        throw new PortalApiError({
          status: 502,
          code: 'USAGE_VERSION_MISMATCH',
          message: 'Usage analytics is temporarily unavailable. Please try again shortly.',
        });
      }
      return parsed.data;
    },
  });
  const events = useQuery({
    queryKey: ['usage-events', page, range.startDate, range.endDate, model, requestType, billingMode],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => portalApi<Paginated<UsageEvent>>(`/usage/events${queryString({
      page,
      pageSize: 25,
      startDate: range.startDate,
      endDate: range.endDate,
      model,
      requestType,
      billingMode,
    })}`, { signal }),
  });

  const models = useMemo(() => {
    const names = summary.data?.models?.map((item) => item.model) ?? [];
    return model && !names.includes(model) ? [model, ...names] : names;
  }, [model, summary.data?.models]);
  const modelDistribution = useMemo<DistributionItem[]>(() => summary.data?.models?.map((item) => ({
    id: `model:${item.model}`,
    label: item.model,
    requests: item.requests,
    totalTokens: item.totalTokens,
    actualCost: item.actualCost,
  })) ?? [], [summary.data?.models]);
  const groupDistribution = useMemo<DistributionItem[]>(() => summary.data?.groups?.map((item) => ({
    id: `group:${item.groupId || item.groupName}`,
    label: item.groupName,
    requests: item.requests,
    totalTokens: item.totalTokens,
    actualCost: item.actualCost,
  })) ?? [], [summary.data?.groups]);
  const endpointDistribution = useMemo<DistributionItem[]>(() => summary.data?.endpoints?.map((item) => ({
    id: `endpoint:${item.endpoint}`,
    label: item.endpoint,
    requests: item.requests,
    totalTokens: item.totalTokens,
    actualCost: item.actualCost,
  })) ?? [], [summary.data?.endpoints]);
  const analyticsTimezone = summary.data?.range?.timezone ?? 'Asia/Kolkata';
  const analyticsGranularity = summary.data?.range?.granularity ?? 'hour';
  const displayedRange = summary.data?.range ?? range;
  const displayedPeriod = `${displayedRange.startDate} to ${displayedRange.endDate}`;
  const refreshing = summary.isFetching || events.isFetching;

  function refreshUsage() {
    if (refreshing) return;
    void Promise.all([
      summary.refetch({ cancelRefetch: false }),
      events.refetch({ cancelRefetch: false }),
    ]);
  }

  function applyRange(nextRange: UsageDateRange) {
    setRange(nextRange);
    setPage(1);
  }

  function exportCsv() {
    if (!events.data?.items.length || events.isPlaceholderData || events.isFetching || events.error) return;
    const headers = ['Time', 'API key', 'Model', 'Endpoint', 'Type', 'Input tokens', 'Output tokens', 'Cache read', 'Cache creation', 'Cost', 'First token', 'Duration'];
    const rows = events.data.items.map((item) => [item.createdAt, item.apiKeyName ?? '', item.model, item.inboundEndpoint ?? '', item.requestType ?? '', item.inputTokens, item.outputTokens, item.cacheReadTokens, item.cacheCreationTokens, item.actualCost, item.firstTokenMs ?? '', item.durationMs ?? '']);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `kineticrouter-usage-${range.startDate}-${range.endDate}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <>
    <PageHeader
      title="Usage"
      description="Billed costs, tokens, and request history."
      action={<div className="page-header-actions"><a className="button button-secondary" href={publicSiteHref('/pricing')} target="_blank" rel="noopener noreferrer">Public pricing</a><Button variant="secondary" aria-label="Refresh usage" disabled={refreshing} onClick={refreshUsage}><RefreshCw size={15} className={refreshing ? 'spin' : undefined} />{refreshing ? 'Refreshing…' : 'Refresh'}</Button><Button variant="secondary" disabled={!events.data?.items.length || events.isPlaceholderData || events.isFetching || Boolean(events.error)} onClick={exportCsv}><Download size={15} /> Export current page</Button></div>}
    />

    {summary.isFetching && summary.data && <p className="query-updating" role="status">Updating usage…{summary.isPlaceholderData ? ` Showing ${displayedPeriod}.` : ''}</p>}

    {summary.isLoading ? <div className="stats-grid compact"><StatSkeletons /></div> : summary.data ? <section className="stats-grid compact usage-stats-grid">
      <StatCard label="Billed cost" value={formatMoney(summary.data.stats.actualCost, 4)} helper={displayedPeriod} icon={<Coins size={19} />} />
      <StatCard label="Requests" value={formatNumber(summary.data.stats.totalRequests)} helper={displayedPeriod} icon={<Activity size={19} />} />
      <StatCard label="Tokens" value={formatNumber(summary.data.stats.totalTokens)} helper={`${formatNumber(summary.data.stats.totalCacheReadTokens)} cache read`} icon={<Zap size={19} />} />
      <StatCard label="Average latency" value={formatLatency(summary.data.stats.averageDurationMs)} helper="Across requests in this range" icon={<Timer size={19} />} />
      <StatCard label="Cache hit rate" value={`${(summary.data.stats.cacheHitRate ?? 0).toFixed(1)}%`} helper="Read cache share of eligible input" icon={<Percent size={19} />} />
    </section> : null}

    <Card className="usage-range-card">
      <div className="usage-range-row">
        <strong>Time Range:</strong>
        <UsageDateRangePicker value={range} timezone={analyticsTimezone} onApply={applyRange} />
      </div>
      <span className="usage-range-caption" aria-live="polite">
        {range.startDate} to {range.endDate}{summary.data ? ` | ${analyticsGranularity === 'day' ? 'Daily' : 'Hourly'} grouping | ${analyticsTimezone}` : ''}
      </span>
    </Card>

    {summary.error && <ErrorState error={summary.error} retry={() => void summary.refetch()} />}
    {summary.isLoading && <section className="usage-analytics-grid"><AnalyticsSkeletons /></section>}
    {summary.data && <>
      <Suspense fallback={<section className="usage-analytics-grid"><AnalyticsSkeletons /></section>}>
        <section className="usage-analytics-grid">
          <UsageDistributionCard title="Usage by model" dimension="Model" items={modelDistribution} />
          <UsageDistributionCard title="Usage by group" dimension="Group" items={groupDistribution} />
          <UsageDistributionCard title="Usage by endpoint" dimension="Endpoint" items={endpointDistribution} />
          <TokenUsageTrend data={summary.data.trend ?? []} />
        </section>
      </Suspense>
      <Card className="usage-main-chart">
        <div className="card-heading"><div><h2>Spend trend</h2><p>{displayedPeriod}, grouped {analyticsGranularity === 'day' ? 'daily' : 'hourly'}.</p></div></div>
        <Suspense fallback={<LoadingState label="Loading spend trend" />}><UsageChart data={summary.data.trend ?? []} granularity={analyticsGranularity} /></Suspense>
      </Card>
    </>}

    <Card className="filters-card history-filters">
      <label><span>Model</span><select value={model} onChange={(event) => { setModel(event.target.value); setPage(1); }}><option value="">All models</option>{models.map((name) => <option key={name}>{name}</option>)}</select></label>
      <label><span>Request type</span><select value={requestType} onChange={(event) => { setRequestType(event.target.value); setPage(1); }}><option value="">All types</option><option value="stream">Stream</option><option value="sync">Sync</option><option value="ws_v2">WebSocket</option><option value="live">Live</option></select></label>
      <label><span>Billing mode</span><select value={billingMode} onChange={(event) => { setBillingMode(event.target.value); setPage(1); }}><option value="">All billing</option><option value="token">Token</option><option value="per_request">Per request</option><option value="image">Image</option><option value="video">Video</option></select></label>
    </Card>
    {events.isFetching && events.data && <p className="query-updating" role="status">Updating requests…{events.isPlaceholderData ? ' Showing the previous results.' : ''}</p>}
    <Card className="table-card usage-table-card" aria-busy={events.isFetching}>
      <div className="table-card-title"><div><h2>Request history</h2><p>Detailed usage events from your account.</p></div><span><Search size={14} /> {events.data?.total ?? 0} results</span></div>
      {events.error && events.data && <ErrorState error={events.error} retry={() => void events.refetch()} />}
      {events.isLoading ? <LoadingState label="Loading usage history" /> : events.error && !events.data ? <ErrorState error={events.error} retry={() => void events.refetch()} /> : !events.data?.items.length ? <EmptyState title="No usage in this period" description="Try a wider date range or make your first API request." /> : <><div className="data-table-wrap"><table className="data-table usage-table"><thead><tr><th>Time</th><th>Model</th><th>API key</th><th>Tokens</th><th>Cache read / create</th><th>Latency</th><th className="align-right">Cost</th></tr></thead><tbody>{events.data.items.map((item) => <tr key={item.id}><td><span className="date-cell">{formatDate(item.createdAt, true)}</span></td><td><div className="usage-model"><strong className="usage-model-name"><ProviderIcon model={item.model} size={14} /><span>{item.model}</span></strong><small>{item.inboundEndpoint || item.requestType || 'API request'}</small></div></td><td>{item.apiKeyName || 'Deleted key'}</td><td><div className="token-split"><span>{formatNumber(item.inputTokens)} in</span><span>{formatNumber(item.outputTokens)} out</span></div></td><td><div className="token-split"><span>{formatNumber(item.cacheReadTokens)} read</span><span>{formatNumber(item.cacheCreationTokens)} create</span></div></td><td><div className="latency-cell"><span>{formatLatency(item.firstTokenMs)} TTFT</span><small>{formatLatency(item.durationMs)} total</small></div></td><td className="align-right mono">{formatMoney(item.actualCost, 6)}</td></tr>)}</tbody></table></div><div className="pagination"><span>{events.data.total} events</span><div><Button variant="secondary" disabled={events.isPlaceholderData || events.data.page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span>{events.data.page} / {events.data.pages}</span><Button variant="secondary" disabled={events.isPlaceholderData || events.data.page >= events.data.pages} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div></>}
    </Card>
  </>;
}

function StatSkeletons() {
  return <>{[0, 1, 2, 3, 4].map((item) => <Card className="stat-card" key={item}><span className="skeleton stat-skeleton-icon" /><span className="skeleton stat-skeleton-copy" /></Card>)}</>;
}

function AnalyticsSkeletons() {
  return <>{[0, 1, 2, 3].map((item) => <Card className="usage-analytics-card usage-analytics-skeleton" key={item}><span className="skeleton usage-skeleton-heading" /><span className="skeleton usage-skeleton-chart" /></Card>)}</>;
}
