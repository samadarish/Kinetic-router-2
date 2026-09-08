import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CreditCard, Layers3 } from 'lucide-react';
import type { Subscription } from '@kineticrouter/portal-contract';
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/Ui';
import { portalApi } from '../lib/api';
import { formatDate, formatOptionalMoney } from '../lib/format';

export function SubscriptionsPage() {
  const query = useQuery({ queryKey: ['subscriptions'], queryFn: ({ signal }) => portalApi<Subscription[]>('/subscriptions', { signal }) });
  return <>
    <PageHeader title="Subscriptions" description="Plan dates and billed usage against your limits." />
    {query.isLoading ? <LoadingState label="Loading subscriptions" /> : query.error ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : !query.data?.length ? <Card><EmptyState title="No subscriptions" description="Subscriptions assigned to your account will appear here." /></Card> : <div className="subscription-grid">{query.data.map((subscription) => <Card className="subscription-card" key={subscription.id}><header><span className="subscription-icon"><Layers3 size={19} /></span><div><h2>{subscription.group?.name || 'Subscription'}</h2><p>{subscription.group?.description || subscription.group?.platform || 'kineticRouter model access'}</p></div><Badge tone={subscription.status === 'active' ? 'success' : 'neutral'}>{subscription.status}</Badge></header><div className="subscription-dates"><span><CalendarClock size={15} /> Valid until <strong>{formatDate(subscription.expiresAt)}</strong></span></div><div className="limit-grid"><UsageLimit label="Daily" used={subscription.dailyUsageUsd} limit={subscription.dailyLimitUsd} /><UsageLimit label="Weekly" used={subscription.weeklyUsageUsd} limit={subscription.weeklyLimitUsd} /><UsageLimit label="Monthly" used={subscription.monthlyUsageUsd} limit={subscription.monthlyLimitUsd} /></div><footer><CreditCard size={14} /> Subscription changes are managed by kineticRouter support.</footer></Card>)}</div>}
  </>;
}

function UsageLimit({ label, used, limit }: { label: string; used?: string | null; limit?: string | null }) {
  const measured = used !== null && used !== undefined && used !== '' && Number.isFinite(Number(used)) && Number(used) >= 0;
  const limited = limit !== null && limit !== undefined && Number.isFinite(Number(limit)) && Number(limit) > 0;
  const ratio = measured && limited ? Math.min(100, (Number(used) / Number(limit)) * 100) : undefined;
  return <div className="usage-limit">
    <div><span>{label}</span><strong>{formatOptionalMoney(used, 4)}{limit ? <small> / {formatOptionalMoney(limit)}</small> : null}</strong></div>
    {ratio !== undefined && <div className="progress" role="progressbar" aria-label={`${label} subscription usage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={ratio} aria-valuetext={`${formatOptionalMoney(used, 4)} used of ${formatOptionalMoney(limit)}`}><i style={{ width: `${ratio}%` }} /></div>}
  </div>;
}
