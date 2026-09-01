import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CreditCard, Gauge, Layers3 } from 'lucide-react';
import type { Subscription } from '@kineticrouter/portal-contract';
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/Ui';
import { portalApi } from '../lib/api';
import { formatDate, formatOptionalMoney } from '../lib/format';

export function SubscriptionsPage() {
  const query = useQuery({ queryKey: ['subscriptions'], queryFn: () => portalApi<Subscription[]>('/subscriptions') });
  return <>
    <PageHeader title="My Subscriptions" description="Track plan validity and usage windows managed by Sub2API." />
    {query.isLoading ? <LoadingState label="Loading subscriptions" /> : query.error ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : !query.data?.length ? <Card><EmptyState title="No active subscriptions" description="You’re currently using account balance billing. Available subscriptions will appear here when assigned." /></Card> : <div className="subscription-grid">{query.data.map((subscription) => <Card className="subscription-card" key={subscription.id}><header><span className="subscription-icon"><Layers3 size={19} /></span><div><h2>{subscription.group?.name || 'Subscription'}</h2><p>{subscription.group?.description || subscription.group?.platform || 'kineticRouter model access'}</p></div><Badge tone={subscription.status === 'active' ? 'success' : 'neutral'}>{subscription.status}</Badge></header><div className="subscription-dates"><span><CalendarClock size={15} /> Valid until <strong>{formatDate(subscription.expiresAt)}</strong></span>{subscription.group?.rateMultiplier && <span><Gauge size={15} /> Rate <strong>{subscription.group.rateMultiplier}×</strong></span>}</div><div className="limit-grid"><UsageLimit label="Daily" used={subscription.dailyUsageUsd} limit={subscription.dailyLimitUsd} /><UsageLimit label="Weekly" used={subscription.weeklyUsageUsd} limit={subscription.weeklyLimitUsd} /><UsageLimit label="Monthly" used={subscription.monthlyUsageUsd} limit={subscription.monthlyLimitUsd} /></div><footer><CreditCard size={14} /> Subscription changes are managed by kineticRouter support.</footer></Card>)}</div>}
  </>;
}

function UsageLimit({ label, used, limit }: { label: string; used?: string | null; limit?: string | null }) { const ratio = limit && Number(limit) > 0 ? Math.min(100,(Number(used ?? 0)/Number(limit))*100) : 0; return <div className="usage-limit"><div><span>{label}</span><strong>{formatOptionalMoney(used,4)}{limit ? <small> / {formatOptionalMoney(limit)}</small> : null}</strong></div><div className="progress"><i style={{ width:`${ratio}%` }} /></div></div>; }
