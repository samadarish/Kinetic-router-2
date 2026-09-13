import { Children, type ComponentProps, type MouseEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Paginated, UsageEvent, UsageSummary } from '@kineticrouter/portal-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultUsageRange } from '../components/UsageDateRangePicker';
import { portalApi } from '../lib/api';
import { publicSiteHref } from '../lib/public-site';
import { UsagePage } from './UsagePage';

const controls = vi.hoisted(() => ({
  refresh: undefined as (() => void) | undefined,
  refreshDisabled: false,
  exportDisabled: false,
}));

vi.mock('../lib/api', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/api')>(),
  portalApi: vi.fn(),
}));

// Keep real markup and queries; expose the rendered button handler without a DOM dependency.
vi.mock('../components/Ui', async importOriginal => {
  const actual = await importOriginal<typeof import('../components/Ui')>();
  return {
    ...actual,
    Button: (props: ComponentProps<typeof actual.Button>) => {
      if (props['aria-label'] === 'Refresh usage') {
        controls.refresh = () => props.onClick?.({} as MouseEvent<HTMLButtonElement>);
        controls.refreshDisabled = Boolean(props.disabled);
      }
      if (Children.toArray(props.children).some(child => typeof child === 'string' && child.includes('Export current page'))) {
        controls.exportDisabled = Boolean(props.disabled);
      }
      return <actual.Button {...props} />;
    },
  };
});

const clients: QueryClient[] = [];
beforeEach(() => { vi.clearAllMocks(); controls.refresh = undefined; });
afterEach(() => { clients.splice(0).forEach(client => client.clear()); });

function fixture(cached = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, refetchOnMount: false, staleTime: Infinity, gcTime: Infinity } } });
  clients.push(client);
  const range = getDefaultUsageRange();
  const summaryKey = ['usage-summary', range.startDate, range.endDate];
  const eventsKey = ['usage-events', 1, range.startDate, range.endDate, '', '', ''];
  const summary: UsageSummary = {
    range: { startDate: range.startDate, endDate: range.endDate, granularity: 'hour', timezone: 'Asia/Kolkata' },
    stats: { totalRequests: 1, totalInputTokens: 20, totalOutputTokens: 10, totalCacheReadTokens: 0, totalCacheCreationTokens: 0, totalTokens: 30, actualCost: '0.25', averageDurationMs: 100, cacheHitRate: 0 },
    trend: [], models: [], groups: [], endpoints: [],
  };
  const events: Paginated<UsageEvent> = {
    items: [{ id: 'request-1', createdAt: `${range.endDate}T12:00:00Z`, apiKeyName: 'Saved request key', model: 'gpt-test', inputTokens: 20, outputTokens: 10, cacheReadTokens: 0, cacheCreationTokens: 0, actualCost: '0.25' }],
    total: 1, page: 1, pageSize: 25, pages: 1,
  };
  if (cached) { client.setQueryData(summaryKey, summary); client.setQueryData(eventsKey, events); }
  const render = () => renderToStaticMarkup(<QueryClientProvider client={client}><UsagePage /></QueryClientProvider>);
  return { client, range, summaryKey, eventsKey, summary, events, render };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}

describe('Usage pricing and manual refresh', () => {
  it('opens public pricing separately without requiring Playground or an auth provider', () => {
    const html = fixture(false).render();
    expect(html).toContain(`href="${publicSiteHref('/pricing')}" target="_blank" rel="noopener noreferrer">Public pricing</a>`);
    expect(html).not.toContain('href="/playground"');
    expect(html).not.toContain('Model rates');
  });

  it('refreshes the visible queries together without restarting requests or invalidating other filters', async () => {
    const fx = fixture(), summary = deferred<UsageSummary>(), events = deferred<Paginated<UsageEvent>>();
    const otherKey = ['usage-events', 4, '2025-01-01', '2025-01-31', 'another-model', 'stream', 'token'];
    const otherData = { retained: true }; fx.client.setQueryData(otherKey, otherData);
    vi.mocked(portalApi).mockImplementation(path => path.startsWith('/usage/summary') ? summary.promise : events.promise);
    fx.render(); const refresh = controls.refresh!;
    refresh(); refresh();
    expect(portalApi).toHaveBeenCalledTimes(2);
    expect(vi.mocked(portalApi).mock.calls.map(([path]) => path)).toEqual([
      `/usage/summary?startDate=${fx.range.startDate}&endDate=${fx.range.endDate}`,
      `/usage/events?page=1&pageSize=25&startDate=${fx.range.startDate}&endDate=${fx.range.endDate}`,
    ]);
    for (const [, init] of vi.mocked(portalApi).mock.calls) expect(init?.signal?.aborted).toBe(false);
    expect(fx.render()).toContain('Refreshing…'); expect(controls.refreshDisabled).toBe(true);
    controls.refresh!(); expect(portalApi).toHaveBeenCalledTimes(2);
    summary.resolve(fx.summary); events.resolve(fx.events);
    await vi.waitFor(() => expect(fx.client.isFetching()).toBe(0));
    fx.render(); expect(controls.refreshDisabled).toBe(false);
    expect(fx.client.getQueryData(otherKey)).toBe(otherData);
    expect(fx.client.getQueryState(otherKey)?.isInvalidated).toBe(false);
  });

  it.each(['summary', 'events'] as const)('retains cached content and the successful update when %s refresh fails', async failed => {
    const fx = fixture();
    vi.mocked(portalApi).mockImplementation(async path => {
      const kind = path.startsWith('/usage/summary') ? 'summary' : 'events';
      if (kind === failed) throw new Error(`${kind} temporarily unavailable`);
      return kind === 'summary'
        ? { ...fx.summary, stats: { ...fx.summary.stats, actualCost: '1.25' } }
        : { ...fx.events, items: [{ ...fx.events.items[0]!, apiKeyName: 'Updated request key' }] };
    });
    fx.render(); controls.refresh!();
    await vi.waitFor(() => expect(fx.client.isFetching()).toBe(0));
    const html = fx.render();
    expect(html).toContain(`${failed} temporarily unavailable`);
    expect(html).toContain(failed === 'summary' ? '$0.25' : '$1.25');
    expect(html).toContain(failed === 'events' ? 'Saved request key' : 'Updated request key');
    expect(html).toContain('class="data-table usage-table"');
    expect(controls.exportDisabled).toBe(failed === 'events');
    expect(controls.refreshDisabled).toBe(false);
  });

  it('keeps the initial history failure state when no cached result exists', () => {
    const fx = fixture(false);
    fx.client.getQueryCache().build(fx.client, { queryKey: fx.eventsKey }).setState({ status: 'error', error: new Error('History unavailable'), fetchStatus: 'idle' });
    const html = fx.render();
    expect(html).toContain('History unavailable');
    expect(html).not.toContain('class="data-table usage-table"');
    expect(html).not.toContain('No usage in this period');
    expect(controls.exportDisabled).toBe(true);
  });
});
