import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KeyQuota } from './KeyQuota';

describe('key quota UI', () => {
  it.each([['79.99', 'normal'], ['80', 'warning'], ['92.245', 'warning'], ['100', 'exhausted']])('shows %s percent in the %s state', (used, state) => {
    const html = renderToStaticMarkup(<KeyQuota name="Production" quota="100" used={used} />);
    expect(html).toContain(`aria-valuenow="${used}"`);
    if (state === 'normal') expect(html).not.toMatch(/quota-warning|quota-exhausted/);
    else expect(html).toContain(`quota-${state}`);
  });

  it('exposes an accessible percentage while preserving overspent dollar values', () => {
    const html = renderToStaticMarkup(<KeyQuota name="Production" quota="10" used="12.3456" />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('aria-valuetext="$12.3456 used of $10.00"');
    expect(html).toContain('width:100%');
  });

  it('shows unlimited credit without a fake percentage', () => {
    const html = renderToStaticMarkup(<KeyQuota name="Production" quota={null} used="3" />);
    expect(html).toContain('Unlimited');
    expect(html).toContain('$3.00');
    expect(html).not.toContain('progressbar');
  });

  it('does not show an empty bar as zero usage when usage is unavailable', () => {
    const html = renderToStaticMarkup(<KeyQuota name="Production" quota="10" />);
    expect(html).toContain('Usage unavailable');
    expect(html).not.toContain('progressbar');
    expect(html).not.toContain('$0.00');
  });
});
