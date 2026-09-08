import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SubscriptionsPage } from './SubscriptionsPage';

describe('customer subscriptions', () => {
  it('preserves billed usage and validity while omitting internal billing presentation', () => {
    const client = new QueryClient();
    client.setQueryData(['subscriptions'], [{
      id: 'subscription-1', status: 'active', expiresAt: '2026-12-31T12:00:00Z',
      group: { id: 'group-1', name: 'Customer plan', rateMultiplier: '7.77' },
      dailyUsageUsd: '12.3456', dailyLimitUsd: '100',
    }]);
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><SubscriptionsPage /></QueryClientProvider>);
    expect(html).toContain('Customer plan');
    expect(html).toContain('$12.3456');
    expect(html).toContain('Valid until');
    expect(html).not.toContain('7.77');
    expect(html).not.toMatch(/rateMultiplier|Rate <|reasoning/);
    expect((html.match(/role="progressbar"/g) ?? [])).toHaveLength(1);
    client.clear();
  });
});
