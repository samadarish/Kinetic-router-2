import { dateInTimezone, splitEngagement } from '@kineticrouter/analytics-client';
import type { MetricsAverages } from '@kineticrouter/portal-contract';

/** Recheck at midnight, each minute, and when a suspended page becomes active. */
export function watchMetricsDay(timezone: string, update: (now: number) => void) {
  let timer: ReturnType<typeof setTimeout>;
  function tick() {
    clearTimeout(timer);
    const now = Date.now();
    update(now);
    const untilBoundary = splitEngagement(now, now + 60000, timezone)[0]!.ms;
    timer = setTimeout(tick, untilBoundary);
  }
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('focus', tick);
  tick();
  return () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', tick);
    window.removeEventListener('focus', tick);
  };
}

export function currentMetricsSnapshot<T extends Pick<MetricsAverages, 'scope' | 'reportingDate' | 'timezone'>>(data: T | undefined, timezone: string, now = Date.now(), scope: MetricsAverages['scope'] = 'today') {
  if (!data || data.scope !== scope || data.reportingDate !== dateInTimezone(now, timezone)) return undefined;
  const canonical = (zone: string) => new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone;
  return canonical(data.timezone) === canonical(timezone) ? data : undefined;
}
export const currentMetricsAverages = currentMetricsSnapshot;
