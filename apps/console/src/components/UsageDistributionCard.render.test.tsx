import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import UsageDistributionCard from './UsageDistributionCard';

describe('customer usage breakdown', () => {
  it('shows billed micro-costs and tokens without upstream reference calculations', () => {
    const html = renderToStaticMarkup(<UsageDistributionCard title="Usage by model" dimension="Model" items={[
      { id: 'model:gpt-test', label: 'gpt-test', requests: 2, totalTokens: 1500, actualCost: '0.000321' },
    ]} />);
    expect(html).toContain('Billed cost');
    expect(html).toContain('$0.000321');
    expect(html).toContain('1.5K');
    expect(html).not.toMatch(/Standard|standardCost|rateMultiplier|reasoning/i);
  });
});
