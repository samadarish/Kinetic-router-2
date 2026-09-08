import type { ChannelMonitor } from '@kineticrouter/portal-contract';

export function reportedModelStatus(channels: ChannelMonitor[] | undefined, model: string): string | undefined {
  const matches = channels?.flatMap(channel => {
    const entries = channel.models?.filter(entry => entry.model === model) ?? [];
    if (entries.length) return entries.map(entry => entry.latestStatus);
    return channel.primaryModel === model ? [channel.primaryStatus] : [];
  }) ?? [];
  if (matches.length !== 1 || !matches[0] || matches[0].toLowerCase() === 'unknown') return undefined;
  const status = matches[0].toLowerCase();
  if (['ok', 'healthy', 'available', 'operational', 'success'].includes(status)) return 'Operational';
  if (['degraded', 'slow'].includes(status)) return 'Degraded';
  if (['error', 'failed', 'failure', 'unavailable', 'offline', 'down'].includes(status)) return 'Unavailable';
  return undefined;
}
