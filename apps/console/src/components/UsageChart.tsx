import { memo, useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { UsageTrendPoint } from '@kineticrouter/portal-contract';
import { formatMoney } from '../lib/format';

function UsageChart({ data, granularity }: { data: UsageTrendPoint[]; granularity: 'hour' | 'day' }) {
  const values = useMemo(() => data.map((point) => ({ ...point, actualCostNumber: Number(point.actualCost) || 0 })), [data]);
  if (data.length === 0) return <div className="chart-empty"><span>No billed usage in this period.</span></div>;
  return <>
    <div className="usage-chart" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><AreaChart data={values} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}><defs><linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#38cce4" stopOpacity={0.34} /><stop offset="100%" stopColor="#379dec" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="var(--chart-grid)" vertical={false} /><XAxis dataKey="timestamp" tickFormatter={(value) => shortDate(value, granularity)} axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} minTickGap={28} /><YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} /><Tooltip contentStyle={{ background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--foreground)', fontSize: 12 }} formatter={(value) => [formatMoney(Number(value), 4), 'Spend']} labelFormatter={(value) => shortDate(value, granularity)} /><Area isAnimationActive={false} type="monotone" dataKey="actualCostNumber" stroke="#38b6e8" strokeWidth={2} fill="url(#costGradient)" /></AreaChart></ResponsiveContainer></div>
    <table className="sr-only"><caption>Actual cost trend</caption><thead><tr><th>Time</th><th>Actual cost</th></tr></thead><tbody>{data.map((point) => <tr key={point.timestamp}><td>{point.timestamp}</td><td>{point.actualCost}</td></tr>)}</tbody></table>
  </>;
}

export default memo(UsageChart);

const chartDateFormats = {
  hour: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
  day: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }),
};

function shortDate(value: unknown, granularity: 'hour' | 'day') {
  const text = String(value);
  const date = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? String(value) : chartDateFormats[granularity].format(date);
}
