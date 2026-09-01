import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleSlash2, Clock3, RadioTower } from 'lucide-react';
import type { ChannelMonitor } from '@kineticrouter/portal-contract';
import { ProviderIcon, resolveProvider } from '../components/ProviderIcon';
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/Ui';
import { portalApi } from '../lib/api';
import { formatLatency } from '../lib/format';

export function StatusPage() {
  const query = useQuery({ queryKey: ['channel-status'], queryFn: () => portalApi<ChannelMonitor[]>('/channels/status'), refetchInterval: 60_000 });
  const healthy = query.data?.filter((channel) => isHealthy(channel.primaryStatus)).length ?? 0;
  return <>
    <PageHeader title="Channel Status" description="Live availability and latency for user-visible model channels." />
    {query.data?.length ? <div className="status-summary"><span className={healthy === query.data.length ? 'status-pulse healthy' : 'status-pulse degraded'} /><div><strong>{healthy === query.data.length ? 'All monitored channels operational' : `${healthy} of ${query.data.length} channels operational`}</strong><p>Status automatically refreshes every minute.</p></div></div> : null}
    {query.isLoading ? <LoadingState label="Checking channel health" /> : query.error ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : !query.data?.length ? <Card><EmptyState title="No public channel monitors" description="Channel monitoring is enabled, but no user-visible monitors are currently configured." /></Card> : <div className="channel-grid">{query.data.map((channel) => {
      const channelKind = resolveProvider({ provider: channel.provider, model: channel.primaryModel });
      return <Card className="channel-card" key={channel.id}>
        <div className="channel-card-header">
          <span className="channel-icon">{channelKind === 'unknown' ? <RadioTower size={19} /> : <ProviderIcon provider={channel.provider} model={channel.primaryModel} size={19} />}</span>
          <div><h2>{channel.name}</h2><p>{channel.groupName || channel.provider}</p></div>
          <Badge tone={isHealthy(channel.primaryStatus) ? 'success' : channel.primaryStatus === 'unknown' ? 'neutral' : 'danger'}>{humanStatus(channel.primaryStatus)}</Badge>
        </div>
        <div className="channel-primary">
          <div><span>Primary model</span><strong className="channel-model-heading">{channel.primaryModel && channelKind !== 'unknown' && <ProviderIcon provider={channel.provider} model={channel.primaryModel} size={13} />}<span>{channel.primaryModel || 'Not specified'}</span></strong></div>
          <div><span>Latency</span><strong>{formatLatency(channel.primaryLatencyMs)}</strong></div>
          <div><span>7-day availability</span><strong>{formatAvailability(channel.availability7d)}</strong></div>
        </div>
        {channel.models?.length ? <div className="model-status-list">{channel.models.slice(0,6).map((model) => {
          const modelKind = resolveProvider({ provider: channel.provider, model: model.model });
          return <div key={model.model}>{isHealthy(model.latestStatus) ? <CheckCircle2 size={14} /> : <CircleSlash2 size={14} />}{modelKind !== 'unknown' && <ProviderIcon provider={channel.provider} model={model.model} size={13} />}<span>{model.model}</span><small>{formatLatency(model.latestLatencyMs)}</small></div>;
        })}</div> : <div className="channel-no-models"><Clock3 size={14} /> Detailed model probes are not exposed.</div>}
      </Card>;
    })}</div>}
  </>;
}

function isHealthy(status: string) { return ['ok','healthy','available','operational','success'].includes(status.toLowerCase()); }
function humanStatus(status: string) { return status ? status.replace(/_/g,' ') : 'Unknown'; }
function formatAvailability(value?: number) { if (value === undefined) return '—'; const normalized = value <= 1 ? value * 100 : value; return `${normalized.toFixed(normalized >= 99 ? 2 : 1)}%`; }
