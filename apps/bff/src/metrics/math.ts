import type { MetricsUser } from '@kineticrouter/portal-contract';

// Fixed twelve-place decimal arithmetic; upstream billed costs use fewer places.
const SCALE = 1_000_000_000_000n;
export function amount(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,12}))?$/.exec(value);
  if (!match) throw new Error('Invalid billed amount');
  return (match[1] ? -1n : 1n) * (BigInt(match[2]!) * SCALE + BigInt((match[3] ?? '').padEnd(12, '0')));
}
export function money(value: bigint): string {
  const sign = value < 0n ? '-' : ''; const absolute = value < 0n ? -value : value;
  const fraction = (absolute % SCALE).toString().padStart(12, '0').replace(/0+$/, '');
  return `${sign}${absolute / SCALE}${fraction ? `.${fraction}` : ''}`;
}
export function rate(value: bigint, elapsedMs: number, hours = 1): string {
  return money(value * BigInt(hours * 3600000) / BigInt(Math.max(1, Math.round(elapsedMs))));
}
export function rankUsers(rows: Array<Omit<MetricsUser, 'score' | 'cohort'>>): MetricsUser[] {
  const active = rows.filter(row => row.requests > 0 || amount(row.actualCost) !== 0n);
  const percentile = (key: 'requests' | 'actualCost') => {
    const sorted = active.map(row => ({ id: row.id, value: key === 'requests' ? BigInt(row.requests) : amount(row.actualCost) })).sort((a, b) => a.value < b.value ? -1 : a.value > b.value ? 1 : 0);
    const ranks = new Map<string, number>();
    for (let i = 0; i < sorted.length;) { let end = i + 1; while (end < sorted.length && sorted[end]!.value === sorted[i]!.value) end++;
      for (let j = i; j < end; j++) ranks.set(sorted[j]!.id, (i + end) / (2 * sorted.length) * 100); i = end;
    } return ranks;
  };
  const requests = percentile('requests'), spend = percentile('actualCost');
  const ranked: MetricsUser[] = rows.map(row => ({ ...row, score: ((requests.get(row.id) ?? 0) + (spend.get(row.id) ?? 0)) / 2, cohort: requests.has(row.id) ? 'regular' : 'none' }));
  const scores = ranked.filter(row => row.cohort !== 'none').map(row => row.score).sort((a, b) => a - b);
  const size = Math.ceil(scores.length * .2), low = scores[size - 1], high = scores[scores.length - size];
  if (low !== undefined && high !== undefined && low < high) for (const row of ranked) if (row.cohort !== 'none') row.cohort = row.score >= high ? 'heavy' : row.score <= low ? 'light' : 'regular';
  return ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
