import { memo, useId, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MetricsOverview, MetricsUsageTrend } from '@kineticrouter/portal-contract';
import { Button, Card } from './Ui';
import { formatMoney } from '../lib/format';
import type { ChartMetric } from '../lib/metrics-controls';

const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const compactNumberFormat = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const periodDateFormats = {
  full: new Intl.DateTimeFormat('en', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }),
  compact: new Intl.DateTimeFormat('en', { timeZone: 'UTC', month: 'short', day: 'numeric' }),
};
export const metricsNumber = (value: number) => numberFormat.format(value);
export const summaryMoney = (value: string) => Number(value) > 0 && Number(value) < .01 ? '<$0.01' : formatMoney(value, 2);
export function ExactMoney({ value }: { value: string }) {
  const id = useId(), [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false), [pinned, setPinned] = useState(false), [dismissed, setDismissed] = useState(false);
  const shown = !dismissed && (hovered || focused || pinned);
  return <span className="metrics-money" onMouseEnter={() => { setHovered(true); setDismissed(false); }} onMouseLeave={() => setHovered(false)}>
    <button type="button" className="metrics-money-value" aria-label={`Billed spend ${summaryMoney(value)}. Exact amount $${value}`} aria-describedby={shown ? id : undefined} aria-expanded={shown} onFocus={() => { setFocused(true); setDismissed(false); }} onBlur={() => { setFocused(false); setPinned(false); }} onClick={() => { setPinned(!pinned); setDismissed(pinned); }} onKeyDown={event => { if (event.key === 'Escape') { setDismissed(true); setPinned(false); } }}><span>{summaryMoney(value)}</span></button>
    <span id={id} role="tooltip" className="metrics-money-exact" hidden={!shown}>Exact amount: ${value}</span>
  </span>;
}

/** Periods are civil labels in the reporting timezone, not timestamps in the browser timezone. */
export function metricsPeriodLabel(period: string, compact = false) {
  const date = periodDateFormats[compact ? 'compact' : 'full'].format(new Date(`${period.slice(0, 10)}T00:00:00Z`));
  if (period.length <= 10) return date;
  const hour = Number(period.slice(11, 13)), time = `${hour % 12 || 12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
  return compact ? time : `${date} · ${time}`;
}
const labels: Record<ChartMetric, string> = { actualCost: 'Billed spend', requests: 'Requests', users: 'Active customers' };
const colors: Record<ChartMetric, string> = { actualCost: '#38b6e8', requests: '#6b9bff', users: '#a78bfa' };
type TrendPoint = MetricsUsageTrend['points'][number];
export function metricsChartPoints(trend: MetricsUsageTrend, metric: ChartMetric) {
  return trend.points.map(point => ({ ...point, value: point.covered ? Number(point[metric]) : null }));
}
function TrendTooltip({ active, payload, metric }: { active?: boolean; payload?: readonly { payload?: TrendPoint }[]; metric: ChartMetric }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return <div className="metrics-chart-tooltip"><strong>{metricsPeriodLabel(point.period)}</strong><span>{labels[metric]}: {metric === 'actualCost' ? `$${point.actualCost}` : metricsNumber(point[metric])}</span>{point.partial && <span>Partial period · Recorded so far</span>}</div>;
}
export const MetricsTrend = memo(function MetricsTrend({ trend, timezone, title = 'Recorded usage over time', metric, onMetricChange, allowUsers = false, usersOnly = false }: { trend: MetricsUsageTrend; timezone: string; title?: string; metric: ChartMetric; onMetricChange?(metric: ChartMetric): void; allowUsers?: boolean; usersOnly?: boolean }) {
  const id = useId().replaceAll(':', ''), [open, setOpen] = useState(false);
  const values = useMemo(() => metricsChartPoints(trend, metric), [trend, metric]);
  const ticks = useMemo(() => [...new Set(Array.from({ length: Math.min(7, values.length) }, (_, index) => values[Math.round(index * (values.length - 1) / Math.max(1, Math.min(7, values.length) - 1))]!.period))], [values]);
  const hasCoverage = useMemo(() => values.some(point => point.covered), [values]);
  const partials = useMemo(() => values.filter(point => point.covered && point.partial), [values]);
  const range = values.length ? `${metricsPeriodLabel(values[0]!.period)} – ${metricsPeriodLabel(values[values.length - 1]!.period)}` : 'No available history';
  return <Card className="metrics-trend-card" role="region" aria-label={title}>
    <div className="metrics-section-heading"><div><h3>{title}</h3><p>{trend.granularity === 'hour' ? 'Hourly' : 'Daily'} recorded values · {timezone}</p></div>{onMetricChange && <div className="metrics-segment" role="group" aria-label={`${title} measure`}>{(['actualCost', 'requests', ...(allowUsers ? ['users'] : [])] as ChartMetric[]).map(value => <button type="button" key={value} aria-pressed={metric === value} onClick={() => onMetricChange(value)}>{labels[value]}</button>)}</div>}</div>
    <p className="metrics-chart-range">{range}</p>
    {hasCoverage ? <div className="metrics-chart" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><AreaChart accessibilityLayer={false} data={values} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colors[metric]} stopOpacity={.22} /><stop offset="100%" stopColor={colors[metric]} stopOpacity={.01} /></linearGradient></defs>
      <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
      <XAxis dataKey="period" ticks={ticks} tickFormatter={value => metricsPeriodLabel(String(value), true)} minTickGap={24} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
      <YAxis width={65} tickFormatter={value => `${metric === 'actualCost' ? '$' : ''}${compactNumberFormat.format(Number(value))}`} allowDecimals={metric === 'actualCost'} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
      <Tooltip content={<TrendTooltip metric={metric} />} />
      <Area type="linear" dataKey="value" stroke={colors[metric]} fill={`url(#${id})`} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
      {partials.map(point => <ReferenceDot key={point.period} x={point.period} y={point.value!} r={4} fill="#e4ae50" stroke="var(--card)" />)}
    </AreaChart></ResponsiveContainer></div> : <p className="metrics-chart-empty">No covered usage history is available for this period.</p>}
    <p className="metrics-chart-note">{labels[metric]} per {trend.granularity === 'hour' ? 'hour' : 'day'}. Idle periods are included.{partials.length > 0 && <span><i className="metrics-partial-dot" /> Amber points are partial periods.</span>}</p>
    <details className="metrics-disclosure" onToggle={event => setOpen(event.currentTarget.open)}><summary>View chart data</summary>{open && <TrendDataTable key={`${trend.granularity}:${values[0]?.period}`} trend={trend} allowUsers={allowUsers || metric === 'users'} usersOnly={usersOnly} />}</details>
  </Card>;
});
export function TrendDataTable({ trend, allowUsers, usersOnly = false }: { trend: MetricsUsageTrend; allowUsers: boolean; usersOnly?: boolean }) {
  const [requestedPage, setPage] = useState(1), pages = Math.max(1, Math.ceil(trend.points.length / 100)), page = Math.min(requestedPage, pages);
  const end = trend.points.length - (page - 1) * 100;
  const points = trend.points.slice(Math.max(0, end - 100), end).reverse();
  return <><div className="data-table-wrap"><table className="data-table"><caption className="sr-only">Recorded chart data, newest first</caption><thead><tr><th>Period</th>{allowUsers && <th>Active customers</th>}{!usersOnly && <><th>Requests</th><th>Billed spend (exact)</th></>}<th>Coverage</th></tr></thead><tbody>{points.map(point => <tr key={point.period}><td>{metricsPeriodLabel(point.period)}</td>{allowUsers && <td>{point.covered ? metricsNumber(point.users) : '—'}</td>}{!usersOnly && <><td>{point.covered ? metricsNumber(point.requests) : '—'}</td><td>{point.covered ? `$${point.actualCost}` : '—'}</td></>}<td>{!point.covered ? 'Unavailable' : point.partial ? 'Partial period' : 'Complete'}</td></tr>)}</tbody></table></div>{pages > 1 && <div className="pagination"><span>Chart data · Page {page} of {pages}</span><div className="metrics-actions"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Newer data</Button><Button variant="secondary" disabled={page === pages} onClick={() => setPage(page + 1)}>Older data</Button></div></div>}</>;
}
export function customerMix(data: Pick<MetricsOverview, 'totalUsers' | 'heavyUsers' | 'lightUsers' | 'noUsageUsers'>) {
  return [
    { label: 'Heavy', value: data.heavyUsers, color: '#a78bfa' },
    { label: 'Regular', value: data.totalUsers - data.heavyUsers - data.lightUsers - data.noUsageUsers, color: '#38b6e8' },
    { label: 'Light', value: data.lightUsers, color: '#71c5ad' },
    { label: 'No usage', value: data.noUsageUsers, color: '#7c8492' },
  ];
}
export const CustomerMix = memo(function CustomerMix({ data }: { data: MetricsOverview }) {
  const rows = customerMix(data);
  return <Card className="metrics-mix-card"><div className="metrics-section-heading"><div><h3>Customer mix</h3><p>All registered customers, classified using the report dates.</p></div></div><div className="metrics-mix-layout">
    <div className="metrics-donut" aria-hidden="true">{data.totalUsers > 0 && <ResponsiveContainer width="100%" height="100%"><PieChart accessibilityLayer={false}><Pie data={rows} dataKey="value" nameKey="label" innerRadius="70%" outerRadius="92%" stroke="var(--card)" strokeWidth={3} isAnimationActive={false}>{rows.map(row => <Cell key={row.label} fill={row.color} />)}</Pie></PieChart></ResponsiveContainer>}<div className="metrics-donut-total"><strong>{metricsNumber(data.totalUsers)}</strong><span>customers</span></div></div>
    <table className="metrics-mix-legend"><caption className="sr-only">Customer classifications for all registered customers</caption><thead><tr><th>Classification</th><th>Customers</th><th>Share</th></tr></thead><tbody>{rows.map(row => <tr key={row.label}><th scope="row"><i style={{ background: row.color }} />{row.label}</th><td>{metricsNumber(row.value)}</td><td>{data.totalUsers ? `${metricsNumber(row.value / data.totalUsers * 100)}%` : '—'}</td></tr>)}</tbody></table>
  </div>{data.totalUsers === 0 && <p className="metrics-chart-note">No customer accounts are available.</p>}<details className="metrics-disclosure"><summary>How classifications work</summary><p>Requests and billed spend contribute equally. The top and bottom 20% of customers with consumption are Heavy and Light. Ties stay together; remaining consumers are Regular. Customers without consumption are shown as No usage.</p></details></Card>;
});
