import type { MetricsActiveUsage } from '@kineticrouter/portal-contract';
import { Card } from './Ui';
import { ExactMoney, metricsNumber as number } from './MetricsCharts';


export function MetricsActiveUsage({ data, timezone }: { data: MetricsActiveUsage; timezone: string }) {
  if (data.status === 'unsupported-timezone') return <p className="metrics-window-empty">Active-hour averages are unavailable for this history because clock changes make the recorded hours ambiguous.</p>;
  if (data.status === 'insufficient-history') return <p className="metrics-window-empty">Waiting for a complete hour of available history. Recorded totals above include usage so far.</p>;
  const active = data.activeHours!, completed = data.completedHours!, idle = completed - active;
  const cards = [{ title: 'Average per active hour', value: data.hourly }, { title: 'Average per 5 active hours', value: data.fiveHourly }];
  return <>
    <div className="metrics-active-basis">
      <p className="metrics-rate-basis">Based on <strong>{number(active)} active hours</strong> · {number(idle)} idle hours</p>
      <div className="metrics-active-bar" aria-hidden="true"><span style={{ width: `${active / completed * 100}%` }} /></div>
      <p className="metrics-rate-basis">Fully covered, finished hours only{data.completedThrough && <> · Usage before <time dateTime={data.completedThrough}>{new Intl.DateTimeFormat('en', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.completedThrough))}</time> · {timezone}</>}</p>
    </div>
    <div className="metrics-active-grid">{cards.map(card => <Card className="metrics-rate-card metrics-active-card" key={card.title}>
      <h4>{card.title}</h4>
      <div className="metrics-rate-spend"><strong>{card.value ? <ExactMoney value={card.value.actualCost} /> : '—'}</strong><span>billed spend</span></div>
      <div className="metrics-rate-requests"><span>requests</span><b className="metrics-number">{card.value ? number(card.value.requests) : '—'}</b></div>
    </Card>)}</div>
    {!active && <p className="metrics-window-empty">No completed active hours yet.</p>}
    <p className="metrics-rate-basis">An active hour has at least one request across all customers combined. Current and partially covered hours are excluded; recorded totals above include them.</p>
    <p className="metrics-rate-basis">Five active hours may be separated by idle gaps. This is a calculated rate, not an actual continuous 5-hour period.</p>
    {!!active && <details className="metrics-disclosure metrics-calculation"><summary>How active averages are calculated</summary>
      <ol className="metrics-calculation-flow" aria-label="Active-hour rate calculation">
        <li><span>Usage in finished active hours</span><strong><ExactMoney value={data.actualCost!} /></strong><small>{number(data.totalRequests!)} requests</small></li>
        <li><span>Divided by active hours</span><strong>{number(active)} <small>hours</small></strong><small>Each hour counts once across all customers</small></li>
        <li><span>Average per active hour</span><strong><ExactMoney value={data.hourly!.actualCost} /></strong><small>{number(data.hourly!.requests)} requests / active hour</small></li>
        <li><span>Multiplied by 5</span><strong><ExactMoney value={data.fiveHourly!.actualCost} /></strong><small>{number(data.fiveHourly!.requests)} requests / 5 active hours</small></li>
      </ol>
      <p>Even one request makes an hour active; this does not measure continuous activity within that hour. Zero-cost requests count. Calculations use unrounded totals, even when fewer than five active hours are available.</p>
    </details>}
  </>;
}
