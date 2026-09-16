import type { MetricsBucket, MetricsFiveHourPeaks, MetricsUsageWindow } from '@kineticrouter/portal-contract';
import { amount, money } from './math.js';
import { addDays, localHour, localMidnight } from './time.js';

type Hour = Pick<MetricsBucket, 'period' | 'requests' | 'actualCost' | 'covered' | 'partial'>;
type Candidate = { start: number; requests: number; cost: bigint };
const HOUR = 3600000;

/** Add disjoint, complete civil-day chunks with chronological hours; retain only four hours at each edge. */
export function fiveHourPeaks(timezone: string) {
  const midnights = new Map<string, number>();
  const supportedDays = new Map<string, boolean>();
  const midnight = (day: string): number => {
    const cached = midnights.get(day); if (cached !== undefined) return cached;
    const at = Date.parse(localMidnight(day, timezone)); midnights.set(day, at); return at;
  };
  const edges: Array<{ first: Hour[]; last: Hour[] }> = [];
  let unsupported = false, eligibleWindows = 0;
  let mostRequests: Candidate | null = null, highestSpend: Candidate | null = null;
  const earlier = (next: Candidate, previous: Candidate) => next.start < previous.start;
  function examine(hours: Hour[]) {
    let window: Array<{ at: number; requests: number; cost: bigint }> = [];
    let requests = 0, cost = 0n;
    for (const hour of hours) {
      const day = hour.period.slice(0, 10), start = midnight(day);
      // The source supplies civil-hour labels without offsets. Transition days cannot be reconstructed exactly.
      if (!supportedDays.has(day)) supportedDays.set(day, midnight(addDays(day, 1)) - start === 24 * HOUR && localHour(start, timezone) === `${day} 00:00`);
      if (!supportedDays.get(day)) unsupported = true;
      const at = start + Number(hour.period.slice(11, 13)) * HOUR;
      if (!hour.covered || hour.partial || (window.length && at !== window[window.length - 1]!.at + HOUR)) {
        window = []; requests = 0; cost = 0n;
      }
      if (!hour.covered || hour.partial) continue;
      if (window.length === 5) { const removed = window.shift()!; requests -= removed.requests; cost -= removed.cost; }
      window.push({ at, requests: hour.requests, cost: amount(hour.actualCost) });
      requests += hour.requests; cost += window[window.length - 1]!.cost;
      if (!Number.isSafeInteger(requests)) throw new Error('Five-hour request totals exceed the supported range.');
      if (window.length !== 5) continue;
      eligibleWindows++;
      const next = { start: window[0]!.at, requests, cost };
      if (requests > 0 && (!mostRequests || requests > mostRequests.requests || (requests === mostRequests.requests && earlier(next, mostRequests)))) mostRequests = next;
      if (cost > 0n && (!highestSpend || cost > highestSpend.cost || (cost === highestSpend.cost && earlier(next, highestSpend)))) highestSpend = next;
    }
  }
  const serialize = (value: Candidate | null): MetricsUsageWindow | null => value && ({ startAt: new Date(value.start).toISOString(), endAt: new Date(value.start + 5 * HOUR).toISOString(), requests: value.requests, actualCost: money(value.cost) });
  let finished: MetricsFiveHourPeaks | undefined;
  return {
    add(hours: Hour[]) {
      if (finished) throw new Error('Five-hour peaks have already been finalized.');
      if (!hours.length) return;
      examine(hours);
      edges.push({ first: hours.slice(0, 4), last: hours.slice(-4) });
    },
    finish(): MetricsFiveHourPeaks {
      if (finished) return finished;
      edges.sort((a, b) => a.first[0]!.period.localeCompare(b.first[0]!.period));
      for (let index = 1; index < edges.length; index++) examine([...edges[index - 1]!.last, ...edges[index]!.first]);
      finished = unsupported
        ? { status: 'unsupported-timezone', eligibleWindows: 0, mostRequests: null, highestSpend: null }
        : { status: eligibleWindows ? 'ready' : 'insufficient-history', eligibleWindows, mostRequests: serialize(mostRequests), highestSpend: serialize(highestSpend) };
      return finished;
    },
  };
}
