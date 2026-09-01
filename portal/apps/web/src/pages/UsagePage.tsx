import { lazy, Suspense, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, BadgeDollarSign, Coins, Download, Percent, Search, Timer, Zap } from 'lucide-react';
import { usageSummarySchema, type Paginated, type UsageEvent } from '@kineticrouter/portal-contract';
import type { DistributionItem } from '../components/UsageDistributionCard';
import { ProviderIcon } from '../components/ProviderIcon';
import UsageDateRangePicker, { getDefaultUsageRange, type UsageDateRange } from '../components/UsageDateRangePicker';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatCard } from '../components/Ui';
import { PortalApiError, portalApi, queryString } from '../lib/api';
import { csvCell } from '../lib/csv';
import { formatDate, formatLatency, formatMoney, formatNumber } from '../lib/format';

const UsageChart = lazy(() => import('../components/UsageChart'));
const UsageDistributionCard = lazy(() => import('../components/UsageDistributionCard'));
const TokenUsageTrend = lazy(() => import('../components/TokenUsageTrend'));

export function UsagePage() {
  const [range, setRange] = useState<UsageDateRange>(getDefaultUsageRange);
  const [page, setPage] = useState(1);
  const [model, setModel] = useState('');
  const [requestType, setRequestType] = useState('');
  const [billingMode, setBillingMode] = useState('');
  const summary = useQuery({
    queryKey: ['usage-summary', range.startDate, range.endDate],
    queryFn: async () => {
      const data = await portalApi<unknown>(`/usage/summary${queryString({ startDate: range.startDate, endDate: range.endDate })}`);
      const parsed = usageSummarySchema.safeParse(data);
      if (!parsed.success) {
        throw new PortalApiError({
          status: 502,
          code: 'USAGE_VERSION_MISMATCH',
          message: 'Usage analytics is temporarily unavailable because the portal services are out of sync. Restart the customer portal and sign in again.',
        });
      }
      return parsed.data;
    },
  });
  const events = useQuery({
    queryKey: ['usage-events', page, range.startDate, range.endDate, model, requestType, billingMode],
    queryFn: () => portalApi<Paginated<UsageEvent>>(`/usage/events${queryString({
      page,
      pageSize: 25,
      startDate: range.startDate,
      endDate: range.endDate,
      model,
      requestType,
      billingMode,
    })}`),
  });

  const models = useMemo(() => {
    const names = summary.data?.models?.map((item) => item.model) ?? [];
    return model && !names.includes(model) ? [model, ...names] : names;
  }, [model, summary.data?.models]);
  const modelDistribution: DistributionItem[] = summary.data?.models?.map((item) => ({
    id: `model:${item.model}`,
    label: item.model,
    requests: item.requests,
    totalTokens: item.totalTokens,
    actualCost: item.actualCost,
    standardCost: item.standardCost,
  })) ?? [];
  const groupDistribution: DistributionItem[] = summary.data?.groups?.map((item) => ({
    id: `group:${item.groupId || item.groupName}`,
    label: item.groupName,
    requests: item.requests,
    totalTokens: item.totalTokens,
    actualCost: item.actualCost,
    standardCost: item.standardCost,
  })) ?? [];
  const endpointDistribution: DistributionItem[] = summary.data?.endpoints?.map((item) => ({
    id: `endpoint:${item.endpoint}`,
    label: item.endpoint,
    requests: item.requests,
    totalTokens: item.totalTokens,
    actualCost: item.actualCost,
    standardCost: item.standardCost,
  })) ?? [];
  const analyticsTimezone = summary.data?.range?.timezone ?? 'Asia/Kolkata';
  const analyticsGranularity = summary.data?.range?.granularity ?? 'hour';

  function applyRange(nextRange: UsageDateRange) {
    setRange(nextRange);
    setPage(1);
  }

  function exportCsv() {
    if (!events.data?.items.length) return;
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
      title="Usage Records"
      description="View and analyze your API usage history."
      action={<Button variant="secondary" disabled={!events.data?.items.length} onClick={exportCsv}><Download size={15} /> Export current page</Button>}
    />

    {summary.isLoading ? <div className="stats-grid compact"><StatSkeletons /></div> : summary.data ? <section className="stats-grid compact usage-stats-grid">
      <StatCard label="Actual cost" value={formatMoney(summary.data.stats.actualCost, 4)} helper={`${range.label} billed amount`} icon={<Coins size={19} />} />
      <StatCard label="Standard cost" value={formatMoney(summary.data.stats.standardCost, 4)} helper="List-price equivalent" icon={<BadgeDollarSign size={19} />} />
      <StatCard label="Requests" value={formatNumber(summary.data.stats.totalRequests)} helper={`${range.startDate} to ${range.endDate}`} icon={<Activity size={19} />} />
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
          <UsageDistributionCard title="Model Distribution" dimension="Model" items={modelDistribution} />
          <UsageDistributionCard title="Group Usage Distribution" dimension="Group" items={groupDistribution} />
          <UsageDistributionCard title="Endpoint Distribution" dimension="Endpoint" items={endpointDistribution} />
          <TokenUsageTrend data={summary.data.trend ?? []} />
        </section>
      </Suspense>
      <Card className="usage-main-chart">
        <div className="card-heading"><div><h2>Spend trend</h2><p>{range.label} actual cost, grouped {analyticsGranularity === 'day' ? 'daily' : 'hourly'}.</p></div></div>
        <Suspense fallback={<LoadingState label="Loading spend trend" />}><UsageChart data={summary.data.trend ?? []} granularity={analyticsGranularity} /></Suspense>
      </Card>
    </>}

    <Card className="filters-card history-filters">
      <label><span>Model</span><select value={model} onChange={(event) => { setModel(event.target.value); setPage(1); }}><option value="">All models</option>{models.map((name) => <option key={name}>{name}</option>)}</select></label>
      <label><span>Request type</span><select value={requestType} onChange={(event) => { setRequestType(event.target.value); setPage(1); }}><option value="">All types</option><option value="stream">Stream</option><option value="sync">Sync</option><option value="ws_v2">WebSocket</option><option value="live">Live</option></select></label>
      <label><span>Billing mode</span><select value={billingMode} onChange={(event) => { setBillingMode(event.target.value); setPage(1); }}><option value="">All billing</option><option value="token">Token</option><option value="per_request">Per request</option><option value="image">Image</option><option value="video">Video</option></select></label>
    </Card>
    <Card className="table-card usage-table-card">
      <div className="table-card-title"><div><h2>Request history</h2><p>Detailed usage events from your account.</p></div><span><Search size={14} /> {events.data?.total ?? 0} results</span></div>
      {events.isLoading ? <LoadingState label="Loading usage history" /> : events.error ? <ErrorState error={events.error} retry={() => void events.refetch()} /> : !events.data?.items.length ? <EmptyState title="No usage in this period" description="Try a wider date range or make your first API request." /> : <><div className="data-table-wrap"><table className="data-table usage-table"><thead><tr><th>Time</th><th>Model</th><th>API key</th><th>Tokens</th><th>Cache read / create</th><th>Latency</th><th className="align-right">Cost</th></tr></thead><tbody>{events.data.items.map((item) => <tr key={item.id}><td><span className="date-cell">{formatDate(item.createdAt, true)}</span></td><td><div className="usage-model"><strong className="usage-model-name"><ProviderIcon model={item.model} size={14} /><span>{item.model}</span></strong><small>{item.inboundEndpoint || item.requestType || 'API request'}</small></div></td><td>{item.apiKeyName || 'Deleted key'}</td><td><div className="token-split"><span>{formatNumber(item.inputTokens)} in</span><span>{formatNumber(item.outputTokens)} out</span></div></td><td><div className="token-split"><span>{formatNumber(item.cacheReadTokens)} read</span><span>{formatNumber(item.cacheCreationTokens)} create</span></div></td><td><div className="latency-cell"><span>{formatLatency(item.firstTokenMs)} TTFT</span><small>{formatLatency(item.durationMs)} total</small></div></td><td className="align-right mono">{formatMoney(item.actualCost, 6)}</td></tr>)}</tbody></table></div><div className="pagination"><span>{events.data.total} events</span><div><Button variant="secondary" disabled={events.data.page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span>{events.data.page} / {events.data.pages}</span><Button variant="secondary" disabled={events.data.page >= events.data.pages} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div></>}
    </Card>
  </>;
}

function StatSkeletons() {
  return <>{[0, 1, 2, 3, 4, 5].map((item) => <Card className="stat-card" key={item}><span className="skeleton stat-skeleton-icon" /><span className="skeleton stat-skeleton-copy" /></Card>)}</>;
}

function AnalyticsSkeletons() {
  return <>{[0, 1, 2, 3].map((item) => <Card className="usage-analytics-card usage-analytics-skeleton" key={item}><span className="skeleton usage-skeleton-heading" /><span className="skeleton usage-skeleton-chart" /></Card>)}</>;
}
