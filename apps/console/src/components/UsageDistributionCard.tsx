import { memo, useId, useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ProviderIcon } from './ProviderIcon';
import { Card } from './Ui';
import { formatMoney } from '../lib/format';

export type DistributionItem = {
  id: string;
  label: string;
  requests: number;
  totalTokens: number;
  actualCost: string;
};

type Metric = 'tokens' | 'actualCost';
const colors = ['#3789ef', '#38b6e8', '#38cce4', '#7567f8', '#a05ee8', '#5275d8', '#29a7c7', '#7fc7f1'];
const minimumVisibleSliceAngle = 3;

function UsageDistributionCard({
  title,
  dimension,
  items,
}: {
  title: string;
  dimension: string;
  items: DistributionItem[];
}) {
  const [metric, setMetric] = useState<Metric>('tokens');
  const headingId = useId();
  const showProviderIcons = dimension.toLowerCase() === 'model';
  const rows = useMemo(() => {
    const metricValue = (item: DistributionItem) => metric === 'tokens' ? item.totalTokens : Number(item.actualCost) || 0;
    return [...items].sort((left, right) => metricValue(right) - metricValue(left));
  }, [items, metric]);
  const colorMap = useMemo(() => createDistributionColorMap(items), [items]);
  const total = rows.reduce((sum, item) => sum + (metric === 'tokens' ? item.totalTokens : Number(item.actualCost) || 0), 0);
  const chartData = rows.map((item) => {
    const value = metric === 'tokens' ? item.totalTokens : Number(item.actualCost) || 0;
    const percentage = total > 0 ? (value / total) * 100 : 0;
    return { ...item, value, color: colorMap.get(item.id) ?? colors[0]!, displayName: `${item.label} (${percentage.toFixed(1)}%)` };
  });
  const nonZeroSliceCount = chartData.filter((item) => item.value > 0).length;

  return <Card className="usage-analytics-card" role="region" aria-labelledby={headingId}>
    <div className="usage-card-header">
      <h2 id={headingId}>{title}</h2>
      <div className="metric-toggle" role="group" aria-label={`${title} metric`}>
        <button type="button" aria-pressed={metric === 'tokens'} className={metric === 'tokens' ? 'active' : ''} onClick={() => setMetric('tokens')}>Tokens</button>
        <button type="button" aria-pressed={metric === 'actualCost'} className={metric === 'actualCost' ? 'active' : ''} onClick={() => setMetric('actualCost')}>Billed cost</button>
      </div>
    </div>
    {rows.length === 0 ? <div className="usage-analytics-empty"><span>No {dimension.toLowerCase()} usage in this period.</span></div> : <div className="distribution-layout">
      <div className="distribution-chart" aria-hidden="true">
        {total > 0 ? <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="displayName"
              cx="50%"
              cy="50%"
              innerRadius="52%"
              outerRadius="92%"
              minAngle={nonZeroSliceCount > 1 ? minimumVisibleSliceAngle : 0}
              paddingAngle={nonZeroSliceCount > 1 ? 0.5 : 0}
              stroke="var(--card)"
              strokeWidth={1}
              isAnimationActive={false}
            >
              {chartData.map((item) => <Cell key={item.id} fill={item.color} />)}
            </Pie>
            <Tooltip
              contentStyle={{ background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--foreground)', fontSize: 11 }}
              formatter={(value) => metric === 'tokens' ? formatUsageNumber(Number(value)) : formatUsageMoney(Number(value))}
            />
          </PieChart>
        </ResponsiveContainer> : <div className="distribution-zero-ring" />}
      </div>
      <div className="distribution-table-wrap">
        <table className="distribution-table">
          <caption className="sr-only">{title} details sorted by {metric === 'tokens' ? 'tokens' : 'actual cost'}</caption>
          <thead><tr><th>{dimension}</th><th>Requests</th><th>Tokens</th><th>Billed cost</th></tr></thead>
          <tbody>{rows.map((item) => <tr key={item.id}>
            <td title={item.label}><span className={`distribution-name${showProviderIcons ? ' distribution-name-with-provider' : ''}`}><span className="distribution-dot" style={{ background: colorMap.get(item.id) ?? colors[0] }} />{showProviderIcons && <ProviderIcon model={item.label} size={14} />}<span className="distribution-label">{item.label}</span></span></td>
            <td>{formatUsageNumber(item.requests)}</td>
            <td>{formatUsageNumber(item.totalTokens)}</td>
            <td className="distribution-actual">{formatUsageMoney(item.actualCost)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>}
  </Card>;
}

export default memo(UsageDistributionCard);

export function createDistributionColorMap(items: readonly Pick<DistributionItem, 'id'>[]) {
  const colorMap = new Map<string, string>();
  const usedColorIndexes = new Set<number>();
  const ids = [...new Set(items.map((item) => item.id))].sort(compareIds);

  for (const id of ids) {
    const preferredIndex = colorIndexForId(id);
    let colorIndex = preferredIndex;

    if (usedColorIndexes.size < colors.length) {
      for (let offset = 0; offset < colors.length; offset += 1) {
        const candidateIndex = (preferredIndex + offset) % colors.length;
        if (!usedColorIndexes.has(candidateIndex)) {
          colorIndex = candidateIndex;
          usedColorIndexes.add(candidateIndex);
          break;
        }
      }
    }

    colorMap.set(id, colors[colorIndex]!);
  }

  return colorMap;
}

function colorIndexForId(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = ((hash << 5) - hash + id.charCodeAt(index)) | 0;
  return Math.abs(hash) % colors.length;
}

function compareIds(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

const usageNumberFormats = {
  compact: new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }),
  standard: new Intl.NumberFormat('en-US', { notation: 'standard', maximumFractionDigits: 2 }),
};

function formatUsageNumber(value: string | number) {
  const number = Number(value) || 0;
  return usageNumberFormats[Math.abs(number) >= 1_000 ? 'compact' : 'standard'].format(number);
}

function formatUsageMoney(value: string | number) {
  return formatMoney(value, 6);
}
