import { memo, useId } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { UsageTrendPoint } from '@kineticrouter/portal-contract';
import { Card } from './Ui';
import { formatNumber } from '../lib/format';

const series = [
  { key: 'inputTokens', label: 'Input', color: '#3789ef' },
  { key: 'outputTokens', label: 'Output', color: '#33c7a6' },
  { key: 'cacheCreationTokens', label: 'Cache Creation', color: '#f59e0b' },
  { key: 'cacheReadTokens', label: 'Cache Read', color: '#14b8d4' },
  { key: 'cacheHitRate', label: 'Cache Hit Rate', color: '#805cf5' },
] as const;

function TokenUsageTrend({ data }: { data: UsageTrendPoint[] }) {
  const headingId = useId();
  return <Card className="usage-analytics-card token-trend-card" role="region" aria-labelledby={headingId}>
    <div className="usage-card-header"><h2 id={headingId}>Token usage</h2></div>
    <div className="token-trend-legend" aria-label="Chart legend">
      {series.map((item) => <span key={item.key}><i style={{ borderColor: item.color, background: `${item.color}20` }} />{item.label}</span>)}
    </div>
    {data.length === 0 ? <div className="usage-analytics-empty"><span>No token usage in this period.</span></div> : <>
      <div className="token-trend-chart" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 6, left: -10, bottom: 0 }}>
            <defs><linearGradient id="cacheReadGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#14b8d4" stopOpacity={0.24} /><stop offset="100%" stopColor="#14b8d4" stopOpacity={0.02} /></linearGradient></defs>
            <CartesianGrid stroke="var(--chart-grid)" />
            <XAxis dataKey="timestamp" tickFormatter={formatTrendLabel} axisLine={false} tickLine={false} minTickGap={30} tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
            <YAxis yAxisId="tokens" axisLine={false} tickLine={false} width={54} tickFormatter={(value) => formatNumber(Number(value))} tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
            <YAxis yAxisId="rate" orientation="right" domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} axisLine={false} tickLine={false} width={38} tickFormatter={(value) => `${value}%`} tick={{ fill: '#805cf5', fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--foreground)', fontSize: 11 }}
              labelFormatter={formatTrendLabel}
              formatter={(value, name) => {
                const item = series.find((candidate) => candidate.key === name);
                return name === 'cacheHitRate'
                  ? [`${Number(value ?? 0).toFixed(1)}%`, item?.label ?? name]
                  : [formatNumber(Number(value ?? 0)), item?.label ?? name];
              }}
            />
            <Area yAxisId="tokens" type="monotone" dataKey="cacheReadTokens" stroke="#14b8d4" strokeWidth={2} fill="url(#cacheReadGradient)" dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
            <Line yAxisId="tokens" type="monotone" dataKey="inputTokens" stroke="#3789ef" strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
            <Line yAxisId="tokens" type="monotone" dataKey="outputTokens" stroke="#33c7a6" strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
            <Line yAxisId="tokens" type="monotone" dataKey="cacheCreationTokens" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
            <Line yAxisId="rate" type="monotone" dataKey="cacheHitRate" stroke="#805cf5" strokeWidth={2} strokeDasharray="6 5" dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Token usage trend values</caption>
        <thead><tr><th>Time</th>{series.map((item) => <th key={item.key}>{item.label}</th>)}</tr></thead>
        <tbody>{data.map((point) => <tr key={point.timestamp}><td>{point.timestamp}</td><td>{point.inputTokens ?? 0}</td><td>{point.outputTokens ?? 0}</td><td>{point.cacheCreationTokens ?? 0}</td><td>{point.cacheReadTokens ?? 0}</td><td>{(point.cacheHitRate ?? 0).toFixed(2)}%</td></tr>)}</tbody>
      </table>
    </>}
  </Card>;
}

export default memo(TokenUsageTrend);

const trendDateFormats = {
  date: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }),
  time: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric' }),
};

function formatTrendLabel(value: unknown) {
  const text = String(value);
  const parsed = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return text;
  const includeTime = /[T ]\d{2}:/.test(text);
  return trendDateFormats[includeTime ? 'time' : 'date'].format(parsed);
}
