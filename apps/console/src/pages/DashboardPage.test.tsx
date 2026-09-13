import type { ButtonHTMLAttributes } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import type { Dashboard } from '@kineticrouter/portal-contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';

const view = vi.hoisted(() => ({
  queries: new Map<string, () => unknown>(),
  refresh: undefined as (() => void) | undefined,
  retry: undefined as (() => void) | undefined,
}));
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useQuery: ({ queryKey }: { queryKey: string[] }) => view.queries.get(queryKey[0]!)!(),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ capabilities: {} }) }));
vi.mock('../components/QuickIntegration', () => ({ QuickIntegration: () => null }));
vi.mock('../components/Ui', async importOriginal => {
  const actual = await importOriginal<typeof import('../components/Ui')>();
  return { ...actual, Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => {
    if (props['aria-label'] === 'Refresh dashboard') view.refresh = props.onClick as (() => void) | undefined;
    return <actual.Button {...props} />;
  }, ErrorState: (props: { error: unknown; retry?: () => void }) => {
    view.retry = props.retry;
    return <actual.ErrorState {...props} />;
  } };
});

const dashboard: Dashboard = {
  user: { id: '1', username: 'Test user', email: 'user@example.com', avatarUrl: null, role: 'user', status: 'active', balance: '12.50', concurrency: 1, runMode: 'normal' },
  stats: {
    totalApiKeys: 2, activeApiKeys: 1, todayRequests: 3, totalRequests: 10,
    todayActualCost: '0.1', totalActualCost: '1.5', todayTokens: 300, totalTokens: 1000,
    todayInputTokens: 200, todayOutputTokens: 100, todayCacheReadTokens: 0, todayCacheCreationTokens: 0,
    totalInputTokens: 700, totalOutputTokens: 300, totalCacheReadTokens: 0, totalCacheCreationTokens: 0,
    rpm: 0, tpm: 0, averageDurationMs: 250, byPlatform: [],
  },
};
type Readiness = { status: 'ready' | 'degraded' };
const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).forEach(run => run()); view.queries.clear(); view.refresh = undefined; view.retry = undefined; vi.restoreAllMocks(); });

function setup(readDashboard: () => Promise<Dashboard>, readReadiness: () => Promise<Readiness>, cached = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const account = new QueryObserver(client, { queryKey: ['dashboard'], queryFn: readDashboard, initialData: cached ? dashboard : undefined, enabled: false });
  const readiness = new QueryObserver(client, { queryKey: ['readiness'], queryFn: readReadiness, initialData: { status: 'ready' } as Readiness, enabled: false });
  const unsubscribeAccount = account.subscribe(() => {}), unsubscribeReadiness = readiness.subscribe(() => {});
  view.queries.set('dashboard', () => account.getCurrentResult());
  view.queries.set('readiness', () => readiness.getCurrentResult());
  cleanup.push(() => { unsubscribeAccount(); unsubscribeReadiness(); client.clear(); });
  return { account, readiness };
}
function render() { return renderToStaticMarkup(<MemoryRouter><DashboardPage /></MemoryRouter>); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}

describe('Dashboard refresh', () => {
  it('can retry an initial account failure while a slow readiness request is still pending', async () => {
    const readinessWork = deferred<Readiness>();
    const readDashboard = vi.fn<() => Promise<Dashboard>>().mockRejectedValueOnce(new Error('Account unavailable')).mockResolvedValue(dashboard);
    const readReadiness = vi.fn(() => readinessWork.promise);
    const { account, readiness } = setup(readDashboard, readReadiness, false);
    const statusRead = readiness.refetch();
    await account.refetch();
    expect(render()).toContain('Account unavailable');
    expect(readiness.getCurrentResult().isFetching).toBe(true);
    expect(view.retry).toBeTypeOf('function');
    view.retry!();
    expect(readDashboard).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(account.getCurrentResult().isSuccess).toBe(true));
    expect(render()).toContain('$12.50');
    expect(readReadiness).toHaveBeenCalledTimes(1);
    readinessWork.resolve({ status: 'ready' }); await statusRead;
  });

  it('refreshes both reads together, coalesces repeated clicks and keeps figures visible until both finish', async () => {
    const accountWork = deferred<Dashboard>(), readinessWork = deferred<Readiness>();
    const readDashboard = vi.fn(() => accountWork.promise), readReadiness = vi.fn(() => readinessWork.promise);
    const { account, readiness } = setup(readDashboard, readReadiness);
    render();
    view.refresh!(); view.refresh!();
    expect(readDashboard).toHaveBeenCalledTimes(1); expect(readReadiness).toHaveBeenCalledTimes(1);
    let html = render();
    expect(html).toContain('$12.50');
    expect(html).toMatch(/<button(?=[^>]*aria-label="Refresh dashboard")(?=[^>]*disabled="")/);
    expect(html).toContain('Refreshing…');
    accountWork.resolve({ ...dashboard, user: { ...dashboard.user, balance: '25.00' } });
    await vi.waitFor(() => expect(account.getCurrentResult().isFetching).toBe(false));
    expect(render()).toContain('Refreshing…');
    readinessWork.resolve({ status: 'degraded' });
    await vi.waitFor(() => expect(readiness.getCurrentResult().isFetching).toBe(false));
    html = render();
    expect(html).toContain('$25.00'); expect(html).toContain('Service degraded');
    expect(html).not.toContain('Refreshing…');
    expect(html).not.toMatch(/<button(?=[^>]*aria-label="Refresh dashboard")(?=[^>]*disabled="")/);
  });

  it('retains cached account figures after failure and recovers on the next refresh', async () => {
    const readDashboard = vi.fn<() => Promise<Dashboard>>().mockRejectedValueOnce(new Error('Temporary outage')).mockResolvedValue({ ...dashboard, user: { ...dashboard.user, balance: '30.00' } });
    const { account, readiness } = setup(readDashboard, async () => ({ status: 'ready' }));
    render(); view.refresh!();
    await vi.waitFor(() => expect(account.getCurrentResult().isError && !readiness.getCurrentResult().isFetching).toBe(true));
    const html = render();
    expect(html).toContain('$12.50'); expect(html).toContain('Showing previously loaded account data.');
    expect(html).toContain('Total Requests');
    view.refresh!();
    await vi.waitFor(() => expect(account.getCurrentResult().isSuccess && !account.getCurrentResult().isFetching).toBe(true));
    expect(render()).toContain('$30.00');
    expect(render()).not.toContain('Showing previously loaded account data.');
  });

  it('updates account figures even when the service-status refresh fails', async () => {
    const { account, readiness } = setup(async () => ({ ...dashboard, user: { ...dashboard.user, balance: '40.00' } }), async () => { throw new Error('Status offline'); });
    render(); view.refresh!();
    await vi.waitFor(() => expect(!account.getCurrentResult().isFetching && readiness.getCurrentResult().isError).toBe(true));
    const html = render();
    expect(html).toContain('$40.00'); expect(html).toContain('Service status is unavailable.');
    expect(html).toContain('Use Refresh to try again.');
    expect(html).not.toContain('Refreshing…');
  });
});
