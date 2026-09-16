import type { MetricsActivity, MetricsBucket, MetricsCoverage, MetricsUsageTrend } from '@kineticrouter/portal-contract';
import type { CustomerUsagePoint } from '@kineticrouter/sub2api-client';
import { amount, money } from './math.js';
import { addDays, localHour, monday, isHourStart } from './time.js';
import { fiveHourPeaks } from './peaks.js';
import { activeHourUsage } from './active-usage.js';

type Working = Omit<MetricsBucket, 'children'> & { children: Working[]; identities: Set<string>; cost: bigint };
type ActivityInput = { startDate: string; endDate: string; source: 'api' | 'console'; timezone: string; now: number; coverage: MetricsCoverage; rows: CustomerUsagePoint[] };
const trendPoint = ({ period, users, requests, actualCost, covered, partial }: MetricsBucket): MetricsUsageTrend['points'][number] => ({ period, users, requests, actualCost, covered, partial });
function safeSum(a: number, b: number) { const value = a + b; if (!Number.isSafeInteger(value)) throw new Error('Activity totals exceed the supported range.'); return value; }
const create = (period: string, level: MetricsBucket['level']): Working => ({ period, level, users: 0, requests: 0, actualCost: '0', covered: false, partial: false, children: [], identities: new Set(), cost: 0n });
function merge(parent: Working, child: Working) {
  parent.children.push(child); for (const id of child.identities) parent.identities.add(id);
  parent.requests = safeSum(parent.requests, child.requests); parent.cost += child.cost;
  parent.covered ||= child.covered;
  parent.partial ||= !child.covered || child.partial;
}
const publicRow = (row: Working): MetricsBucket => ({ period: row.period, level: row.level, users: row.identities.size, requests: row.requests, actualCost: money(row.cost), covered: row.covered, partial: row.partial, children: row.children.map(publicRow) });
const createCells = () => Array.from({ length: 168 }, (_, i) => ({ weekday: Math.floor(i / 24), hour: i % 24, occurrences: 0, users: 0, requests: 0, cost: 0n }));
const heatmap = (cells: ReturnType<typeof createCells>): MetricsActivity['heatmap'] => cells.map(cell => ({ weekday: cell.weekday, hour: cell.hour, occurrences: cell.occurrences, users: cell.occurrences ? cell.users / cell.occurrences : 0, requests: cell.occurrences ? cell.requests / cell.occurrences : 0, actualCost: money(cell.occurrences ? cell.cost / BigInt(cell.occurrences) : 0n) }));

/** Build exact hourly/day buckets without calculating summaries that a history fold would discard. */
function aggregateDays(input: ActivityInput) {
  const { timezone, now, coverage } = input;
  const currentHour = localHour(now, timezone);
  const firstHour = coverage.availableFrom ? localHour(Date.parse(coverage.availableFrom), timezone) : null;
  const hourMap = new Map<string, Working>();
  for (let day = input.startDate; day <= input.endDate; day = addDays(day, 1)) for (let hour = 0; hour < 24; hour++) {
    const period = `${day} ${String(hour).padStart(2, '0')}:00`, row = create(period, 'hour');
    row.covered = firstHour !== null && period >= firstHour && period <= currentHour;
    row.partial = row.covered && ((period === firstHour && !isHourStart(Date.parse(coverage.availableFrom!), timezone)) || period === currentHour);
    hourMap.set(period, row);
  }
  for (const point of input.rows) {
    const row = hourMap.get(point.period); if (!row || !row.covered) continue;
    if (input.source === 'console' || point.requests > 0) row.identities.add(point.userId);
    row.requests = safeSum(row.requests, point.requests); row.cost += amount(point.actualCost);
  }
  const days = new Map<string, Working>();
  for (const hour of hourMap.values()) {
    const day = hour.period.slice(0, 10);
    if (!days.has(day)) days.set(day, create(day, 'day'));
    merge(days.get(day)!, hour);
  }
  return { days, currentHour };
}

export function activityReport(input: ActivityInput): MetricsActivity {
  const { timezone, now, coverage } = input;
  const { days, currentHour } = aggregateDays(input), weeks = new Map<string, Working>();
  for (const day of days.values()) {
    const week = monday(day.period); if (!weeks.has(week)) weeks.set(week, create(week, 'week'));
    merge(weeks.get(week)!, day);
  }
  for (const week of weeks.values()) if (week.children.length !== 7) week.partial = true;
  const cells = createCells();
  let peakUsers: Working | null = null, peakRequests: Working | null = null;
  for (const day of days.values()) {
    const weekday = (new Date(day.period).getUTCDay() + 6) % 7;
    for (const hour of day.children) if (hour.covered && !hour.partial) {
      const cell = cells[weekday * 24 + Number(hour.period.slice(11, 13))]!;
      cell.occurrences++; cell.users = safeSum(cell.users, hour.identities.size); cell.requests = safeSum(cell.requests, hour.requests); cell.cost += hour.cost;
      // Hours are chronological, so strict comparisons preserve the earliest tie.
      if (hour.identities.size > (peakUsers?.identities.size ?? 0)) peakUsers = hour;
      if (hour.requests > (peakRequests?.requests ?? 0)) peakRequests = hour;
    }
  }
  const publicWeeks = [...weeks.values()].map(publicRow), publicDays = publicWeeks.flatMap(week => week.children);
  const windows = fiveHourPeaks(timezone), active = activeHourUsage(timezone);
  if (input.source === 'api') { const hours = publicDays.flatMap(day => day.children); windows.add(hours); active.add(hours); }
  const fiveHourSummary = input.source === 'api' ? windows.finish() : null;
  const hourly = input.startDate === input.endDate;
  const usageTrend: MetricsUsageTrend = { granularity: hourly ? 'hour' : 'day', points: (hourly ? publicDays.flatMap(day => day.children).filter(hour => hour.period <= currentHour) : publicDays).map(trendPoint) };
  return { generatedAt: new Date(now).toISOString(), timezone, coverage, source: input.source, range: { mode: 'custom', startDate: input.startDate, endDate: input.endDate }, pagination: null, weeks: publicWeeks, usageTrend,
    heatmap: heatmap(cells),
    peakUsers: peakUsers ? publicRow(peakUsers) : null, peakRequests: peakRequests ? publicRow(peakRequests) : null, fiveHourPeaks: fiveHourSummary,
    activeUsage: fiveHourSummary ? active.finish(fiveHourSummary.status === 'unsupported-timezone') : null };
}

/** Fold complete hours across history while retaining detail for only thirteen weeks. */
export function pagedActivity(input: Omit<Parameters<typeof activityReport>[0], 'rows'> & { page: number }) {
  const totalWeeks = input.coverage.availableFrom ? Math.floor((Date.parse(monday(input.endDate)) - Date.parse(monday(input.startDate))) / 604800000) + 1 : 0;
  const totalPages = Math.max(1, Math.ceil(totalWeeks / 13)), page = Math.min(input.page, totalPages);
  const lastWeek = addDays(monday(input.endDate), -(page - 1) * 91);
  const detailStart = [input.startDate, addDays(lastWeek, -84)].sort()[1]!;
  const detailEnd = [input.endDate, addDays(lastWeek, 6)].sort()[0]!;
  const detail: CustomerUsagePoint[] = [];
  const cells = createCells();
  let peakUsers: MetricsBucket | null = null, peakRequests: MetricsBucket | null = null;
  const windows = fiveHourPeaks(input.timezone), active = activeHourUsage(input.timezone);
  const dailyTrend = new Map<string, MetricsUsageTrend['points'][number]>();
  const peak = (previous: MetricsBucket | null, next: MetricsBucket, key: 'users' | 'requests') => next[key] > 0 && (!previous || next[key] > previous[key] || (next[key] === previous[key] && next.period < previous.period)) ? next : previous;
  return {
    detailRange: { startDate: detailStart, endDate: detailEnd },
    add(startDate: string, endDate: string, rows: CustomerUsagePoint[]) {
      const { days } = aggregateDays({ ...input, startDate, endDate, rows });
      // Retain the overflow check formerly performed while constructing discarded week buckets.
      let previousWeek = '', weekRequests = 0;
      for (const day of days.values()) {
        const week = monday(day.period);
        weekRequests = safeSum(week === previousWeek ? weekRequests : 0, day.requests); previousWeek = week;
      }
      const hours: MetricsBucket[] = [];
      for (const day of days.values()) {
        if (dailyTrend.has(day.period)) throw new Error('Activity chunks overlap.');
        dailyTrend.set(day.period, { period: day.period, users: day.identities.size, requests: day.requests, actualCost: money(day.cost), covered: day.covered, partial: day.partial });
        const weekday = (new Date(day.period).getUTCDay() + 6) % 7;
        for (const hour of day.children) {
          const value = publicRow(hour);
          if (input.source === 'api') hours.push(value);
          if (!hour.covered || hour.partial) continue;
          const cell = cells[weekday * 24 + Number(hour.period.slice(11, 13))]!;
          cell.occurrences++; cell.users = safeSum(cell.users, value.users); cell.requests = safeSum(cell.requests, hour.requests); cell.cost += hour.cost;
          peakUsers = peak(peakUsers, value, 'users'); peakRequests = peak(peakRequests, value, 'requests');
        }
      }
      if (input.source === 'api') { windows.add(hours); active.add(hours); }
      for (const row of rows) if (row.period.slice(0, 10) >= detailStart && row.period.slice(0, 10) <= detailEnd) detail.push(row);
    },
    finish(): MetricsActivity {
      const report = activityReport({ ...input, startDate: detailStart, endDate: detailEnd, rows: detail });
      const fiveHourSummary = input.source === 'api' ? windows.finish() : null;
      return { ...report, range: { mode: 'all-time', startDate: totalWeeks ? input.startDate : null, endDate: input.endDate },
        pagination: { page, pageSize: 13, totalPages, totalWeeks, startDate: totalWeeks ? detailStart : null, endDate: totalWeeks ? detailEnd : null },
        weeks: totalWeeks ? report.weeks : [], peakUsers, peakRequests, fiveHourPeaks: fiveHourSummary,
        activeUsage: fiveHourSummary ? active.finish(fiveHourSummary.status === 'unsupported-timezone') : null,
        usageTrend: { granularity: 'day', points: totalWeeks ? [...dailyTrend.values()].sort((a, b) => a.period.localeCompare(b.period)) : [] },
        heatmap: heatmap(cells) };
    },
  };
}
