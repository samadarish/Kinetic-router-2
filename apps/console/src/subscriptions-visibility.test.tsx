// @vitest-environment jsdom
import { act, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { portalApi } from './lib/api';

const mocks = vi.hoisted(() => ({ auth: {
  loading: false, authenticated: true, playgroundEnabled: false,
  user: { id: '42', role: 'user', status: 'active', username: 'Customer', runMode: 'normal' },
  capabilities: { subscriptions: true as boolean | undefined }, logout: vi.fn(),
} }));
vi.mock('./lib/auth', () => ({ useAuth: () => mocks.auth }));
vi.mock('./lib/api', async original => ({ ...await original<typeof import('./lib/api')>(), portalApi: vi.fn() }));
vi.mock('./lib/support-context', () => ({
  SupportProvider: ({ children }: PropsWithChildren) => children,
  useSupport: () => ({ presence: { status: 'offline' }, connection: 'unavailable', unreadCount: 0 }),
}));
vi.mock('./lib/playground-context', () => ({
  PlaygroundProvider: ({ children }: PropsWithChildren) => children,
  PlaygroundGate: ({ children }: PropsWithChildren) => children,
}));
vi.mock('@kineticrouter/brand-ui', async original => ({ ...await original<typeof import('@kineticrouter/brand-ui')>(), LanguageSelector: () => null }));
vi.mock('./pages/DashboardPage', () => ({ DashboardPage: () => <h1>Dashboard</h1> }));

const subscriptions = [{ id: 'plan-1', status: 'active', group: { id: 'group-1', name: 'Customer plan' } }];
let client: QueryClient;
let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.auth.capabilities.subscriptions = true;
  mocks.auth.user.runMode = 'normal';
  vi.mocked(portalApi).mockReset().mockResolvedValue(subscriptions);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(['subscriptions'], subscriptions);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await Promise.all([import('./pages/SubscriptionsPage'), import('./pages/DashboardPage')]);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/subscriptions']}><App /></MemoryRouter></QueryClientProvider>));
}

describe('console subscription visibility', () => {
  it.each([true, undefined])('shows the navigation and page when enabled or omitted (%s)', async enabled => {
    mocks.auth.capabilities.subscriptions = enabled;
    await render();
    expect(host.querySelector('a[href="/subscriptions"]')?.textContent).toContain('My Subscriptions');
    expect(host.querySelector('main h1')?.textContent).toBe('Subscriptions');
    expect(host.querySelector('main')?.textContent).toContain('Customer plan');
    expect(portalApi).toHaveBeenCalledWith('/subscriptions', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('hides navigation and redirects a direct visit without reading or showing cached subscriptions', async () => {
    mocks.auth.capabilities.subscriptions = false;
    await render();
    expect(host.querySelector('a[href="/subscriptions"]')).toBeNull();
    expect(host.querySelector('main h1')?.textContent).toBe('Dashboard');
    expect(host.textContent).not.toContain('Customer plan');
    expect(portalApi).not.toHaveBeenCalled();
  });

  it('redirects an open page and cancels its pending read when refreshed capabilities disable it', async () => {
    let finish!: (value: typeof subscriptions) => void;
    let pendingSignal: AbortSignal | undefined;
    vi.mocked(portalApi).mockImplementation((_path, init) => {
      pendingSignal = init?.signal as AbortSignal;
      return new Promise(resolve => { finish = resolve; });
    });
    await render();
    expect(host.textContent).toContain('Customer plan');
    expect(pendingSignal?.aborted).toBe(false);

    mocks.auth.capabilities.subscriptions = false;
    await render();
    expect(pendingSignal?.aborted).toBe(true);
    await act(async () => finish(subscriptions));
    expect(host.querySelector('main h1')?.textContent).toBe('Dashboard');
    expect(host.querySelector('a[href="/subscriptions"]')).toBeNull();
    expect(host.textContent).not.toContain('Customer plan');
  });

  it('keeps subscriptions hidden in simple mode even when the upstream setting is enabled', async () => {
    mocks.auth.user.runMode = 'simple';
    await render();
    expect(host.querySelector('a[href="/subscriptions"]')).toBeNull();
    expect(host.querySelector('main h1')?.textContent).toBe('Dashboard');
    expect(portalApi).not.toHaveBeenCalled();
  });
});
