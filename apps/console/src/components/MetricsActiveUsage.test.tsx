import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MetricsActiveUsage as ActiveUsage } from '@kineticrouter/portal-contract';
import { MetricsActiveUsage } from './MetricsActiveUsage';

const data: ActiveUsage = { status: 'ready', completedThrough: '2026-09-14T14:00:00.000Z', completedHours: 14, activeHours: 7, totalRequests: 1400, actualCost: '140', hourly: { requests: 200, actualCost: '20' }, fiveHourly: { requests: 1000, actualCost: '100' } };
const render = (value = data) => renderToStaticMarkup(<MetricsActiveUsage data={value} timezone="Asia/Kolkata" />);

describe('active-hour usage cards', () => {
  it('shows the denominator, active/idle split, local cutoff and separate active-hour calculation', () => {
    const html = render();
    for (const value of ['Average per active hour', 'Average per 5 active hours', '$20.00', '$100.00', '7 active hours', '7 idle hours', 'width:50%', 'Sep 14, 2026, 7:30 PM', 'Asia/Kolkata', 'Usage before', 'Current and partially covered hours are excluded', 'separated by idle gaps', 'not an actual continuous 5-hour period', 'How active averages are calculated', '$140.00', '1,400 requests', 'Even one request']) expect(html).toContain(value);
    expect(html).toContain('<summary>How active averages are calculated</summary>');
    expect(html).toContain('dateTime="2026-09-14T14:00:00.000Z"');
    expect(html).not.toContain('7-day'); expect(html).not.toContain('168');
  });

  it('distinguishes no activity, no complete history and unsupported hours without misleading zeros', () => {
    const idle = render({ ...data, activeHours: 0, totalRequests: 0, actualCost: '0', hourly: null, fiveHourly: null });
    expect(idle).toContain('No completed active hours yet'); expect(idle).toContain('14 idle hours'); expect(idle).not.toContain('$0.00'); expect(idle).not.toContain('How active averages');
    const missing = render({ ...data, status: 'insufficient-history', completedThrough: null, completedHours: 0, activeHours: 0, totalRequests: 0, actualCost: '0', hourly: null, fiveHourly: null });
    expect(missing).toContain('Waiting for a complete hour'); expect(missing).not.toContain('metrics-active-bar');
    const unsupported = render({ status: 'unsupported-timezone', completedThrough: null, completedHours: null, activeHours: null, totalRequests: null, actualCost: null, hourly: null, fiveHourly: null });
    expect(unsupported).toContain('clock changes'); expect(unsupported).not.toContain('metrics-active-bar');
  });

  it('shows measured zero spend with requests and keeps precise tiny amounts accessible', () => {
    expect(render({ ...data, actualCost: '0', hourly: { requests: 200, actualCost: '0' }, fiveHourly: { requests: 1000, actualCost: '0' } })).toContain('$0.00');
    expect(render({ ...data, hourly: { requests: 200, actualCost: '0.000000000001' } })).toContain('Exact amount: $0.000000000001');
  });
});
