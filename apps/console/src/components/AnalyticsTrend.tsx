import { memo, useId } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnalyticsOverview } from '@kineticrouter/portal-contract';

function AnalyticsTrend({ data }: { data: AnalyticsOverview['trend'] }) {
  const id = useId().replaceAll(':', '');
  return <div className="analytics-chart" role="img" aria-label="Daily visitors and pageviews for the selected range">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.24} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0.01} /></linearGradient></defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
        <XAxis dataKey="date" tickFormatter={date => String(date).slice(5)} minTickGap={35} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} width={48} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--foreground)' }} />
        <Area type="monotone" dataKey="pageviews" name="Pageviews" stroke="var(--muted-foreground)" fill="transparent" strokeDasharray="4 4" strokeWidth={1.5} isAnimationActive={false} />
        <Area type="monotone" dataKey="visitors" name="Visitors" stroke="var(--primary)" fill={`url(#${id})`} strokeWidth={2} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  </div>;
}

export default memo(AnalyticsTrend);
