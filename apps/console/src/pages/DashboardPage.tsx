import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BarChart3, CircleDollarSign, Clock3, Database,
  Gift, KeyRound, Layers3, Send, WalletCards,
} from 'lucide-react';
import type { Dashboard } from '@kineticrouter/portal-contract';
import { QuickIntegration } from '../components/QuickIntegration';
import { Card, ErrorState, LoadingState, PageHeader } from '../components/Ui';
import { portalApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatLatency, formatMoney, formatNumber } from '../lib/format';

export function DashboardPage() {
  const { capabilities } = useAuth();
  const query = useQuery({ queryKey: ['dashboard'], queryFn: ({ signal }) => portalApi<Dashboard>('/dashboard', { signal }) });
  const readiness = useQuery({ queryKey: ['readiness'], queryFn: ({ signal }) => readReadiness(signal), retry: false, staleTime: 60_000 });
  if (query.isLoading) return <><PageHeader title="Dashboard" description="Your kineticRouter account at a glance." /><LoadingState label="Loading account overview" /></>;
  if (query.error || !query.data) return <><PageHeader title="Dashboard" /><ErrorState error={query.error} retry={() => void query.refetch()} /></>;

  const { user, stats } = query.data;
  const accountName = user.username || user.email?.split('@')[0] || 'there';
  const cachedTokens = stats.totalCacheReadTokens + stats.totalCacheCreationTokens;
  const readinessState = readiness.isLoading ? 'checking' : readiness.isError ? 'unavailable' : readiness.data?.status ?? 'unavailable';
  const readinessLabel = readinessState === 'ready' ? 'Service ready' : readinessState === 'degraded' ? 'Service degraded' : readinessState === 'checking' ? 'Checking status' : 'Status unavailable';

  return <div className="overview-page">
    <section className="overview-welcome" aria-labelledby="overview-title">
      <div className="overview-welcome-copy">
        <div className="overview-kicker">
          <span>{accountName}</span>
          <span className={`readiness-badge ${readinessState}`}><i />{readinessLabel}</span>
        </div>
        <h1 id="overview-title">Dashboard</h1>
        <p>Account balance, usage, and connection details.</p>
      </div>
      <div className="overview-actions" aria-label="Account actions">
        {capabilities?.redeemWrites && user.runMode !== 'simple' && <Link className="button button-secondary" to="/redeem"><Gift size={15} />Redeem balance</Link>}
        {capabilities?.keyWrites && <Link className="button button-primary" to="/api-keys"><KeyRound size={15} />Create API Key</Link>}
        <Link className="button button-secondary" to="/usage"><BarChart3 size={15} />Detailed statistics</Link>
      </div>
    </section>

    <section className="overview-kpi-grid" aria-label="Account statistics">
      <DashboardMetric label="Total Balance" value={formatMoney(user.balance)} helper="Available credit" icon={<WalletCards size={18} />} />
      <DashboardMetric label="Available Keys" value={formatNumber(stats.activeApiKeys)} helper={`${formatNumber(stats.totalApiKeys)} total`} icon={<KeyRound size={18} />} />
      <DashboardMetric label="Billed cost" value={formatMoney(stats.totalActualCost, 4)} helper="Lifetime spend" icon={<CircleDollarSign size={18} />} />
      <DashboardMetric label="Total Tokens" value={formatNumber(stats.totalTokens)} helper={`${formatNumber(stats.totalInputTokens)} in / ${formatNumber(stats.totalOutputTokens)} out`} icon={<Layers3 size={18} />} />
      <DashboardMetric label="Total Requests" value={formatNumber(stats.totalRequests)} helper="All time" icon={<Send size={18} />} />
      <DashboardMetric label="Average Latency" value={formatLatency(stats.averageDurationMs)} helper="Across all requests" icon={<Clock3 size={18} />} />
      <DashboardMetric label="Cached Tokens" value={formatNumber(cachedTokens)} helper={`${formatNumber(stats.totalCacheReadTokens)} read / ${formatNumber(stats.totalCacheCreationTokens)} created`} icon={<Database size={18} />} />
    </section>
    <QuickIntegration />
  </div>;
}

function DashboardMetric({ label, value, helper, icon }: { label: string; value: string; helper: string; icon: ReactNode }) {
  return <Card className="overview-kpi">
    <div className="overview-kpi-heading"><span className="overview-kpi-icon">{icon}</span></div>
    <span className="overview-kpi-label">{label}</span>
    <strong>{value}</strong>
    <small>{helper}</small>
  </Card>;
}

type ReadinessResponse = { status: 'ready' | 'degraded'; upstream?: string; sessions?: string };

async function readReadiness(signal: AbortSignal): Promise<ReadinessResponse> {
  const response = await fetch('/readyz', { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) });
  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || !('status' in payload)) throw new Error('Readiness status is unavailable.');
  const status = (payload as { status?: unknown }).status;
  if (status !== 'ready' && status !== 'degraded') throw new Error('Readiness status is unavailable.');
  if (status === 'ready' && !response.ok) throw new Error('Readiness status is unavailable.');
  return payload as ReadinessResponse;
}
