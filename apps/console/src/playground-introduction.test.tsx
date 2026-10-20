// @vitest-environment jsdom
import { act, useEffect, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { portalApi } from './lib/api';
import { playgroundIntroductionKey } from './lib/playground-introduction';

const mocks = vi.hoisted(() => ({ auth: {
  loading: false, authenticated: true, playgroundEnabled: true,
  user: { id: '42', role: 'user', status: 'active', username: 'Fixture', email: 'fixture@example.test', runMode: 'normal' },
  capabilities: {}, logout: vi.fn(),
}, pageFails: false }));
vi.mock('./lib/auth', () => ({ useAuth: () => mocks.auth }));
vi.mock('./lib/api', async original => ({ ...await original<typeof import('./lib/api')>(), portalApi: vi.fn() }));
vi.mock('./lib/support-context', () => ({ SupportProvider: ({ children }: PropsWithChildren) => children, useSupport: () => ({ presence: { status: 'offline' }, connection: 'unavailable', unreadCount: 0 }) }));
vi.mock('./lib/playground-context', () => ({ PlaygroundProvider: ({ children }: PropsWithChildren) => children, PlaygroundGate: ({ children }: PropsWithChildren) => children }));
vi.mock('@kineticrouter/brand-ui', async original => ({ ...await original<typeof import('@kineticrouter/brand-ui')>(), LanguageSelector: () => null }));
vi.mock('./pages/DashboardPage', () => ({ DashboardPage: () => <h1>Dashboard fixture</h1> }));
vi.mock('./pages/ApiKeysPage', () => ({ ApiKeysPage: () => <h1>Keys fixture</h1> }));
vi.mock('./pages/PlaygroundPage', async () => {
  const { usePlaygroundIntroduction } = await import('./lib/playground-introduction-context');
  return { PlaygroundPage: () => {
    const { visit } = usePlaygroundIntroduction();
    useEffect(() => { visit(); }, [visit]);
    if (mocks.pageFails) throw new Error('Fixture route failed');
    return <h1>Playground fixture</h1>;
  } };
});

let root: Root, host: HTMLDivElement, client: QueryClient;
let visited: Set<string>;
function publishAccount() { client.setQueryData(['session'], { ...mocks.auth, user: { ...mocks.auth.user } }); }
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.localStorage.clear();
  mocks.auth.user.id = '42'; mocks.auth.user.role = 'user'; mocks.auth.playgroundEnabled = true; mocks.pageFails = false;
  visited = new Set();
  vi.mocked(portalApi).mockReset().mockImplementation(async (path, init) => {
    const id = mocks.auth.user.id;
    if (path === '/me/playground-introduction') return { visited: visited.has(id) } as never;
    if (path === '/me/playground-introduction/visited' && init?.method === 'POST') { visited.add(id); return { visited: true } as never; }
    throw new Error(`Unexpected fixture route: ${path}`);
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  publishAccount();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await Promise.all([import('./pages/DashboardPage'), import('./pages/ApiKeysPage'), import('./pages/PlaygroundPage')]);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); window.localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render(path = '/dashboard') {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></QueryClientProvider>));
}
const playgroundLinks = () => [...host.querySelectorAll<HTMLAnchorElement>('a[href="/playground"]')];
const highlighted = () => playgroundLinks().filter(link => link.classList.contains('playground-introduction-highlight'));
async function click(link: HTMLElement) { await act(async () => link.click()); }

describe('console Playground introduction navigation', () => {
  it.each(['user', 'admin'])('keeps both %s links highlighted through unrelated navigation', async role => {
    mocks.auth.user.role = role; publishAccount(); await render();
    expect(highlighted()).toHaveLength(2);
    await click(host.querySelector<HTMLAnchorElement>('a[href="/api-keys"]')!);
    expect(host.querySelector('main h1')?.textContent).toBe('Keys fixture');
    expect(highlighted()).toHaveLength(2);
    expect(visited.size).toBe(0);
  });
  it.each([0, 1])('clears both highlights only after opening Playground from link %s', async index => {
    await render(); expect(highlighted()).toHaveLength(2);
    await click(playgroundLinks()[index]!);
    expect(host.querySelector('main h1')?.textContent).toBe('Playground fixture');
    expect(highlighted()).toHaveLength(0);
    expect(visited.has('42')).toBe(true);
    expect(window.localStorage.getItem(playgroundIntroductionKey('42'))).toBe('visited');
    await click(host.querySelector<HTMLAnchorElement>('a[href="/dashboard"]')!);
    expect(highlighted()).toHaveLength(0);
  });
  it('records a direct first visit after the page mounts', async () => {
    await render('/playground');
    expect(host.querySelector('main h1')?.textContent).toBe('Playground fixture');
    expect(visited.has('42')).toBe(true); expect(highlighted()).toHaveLength(0);
  });
  it('keeps visited accounts dismissed in a fresh browser and separates account switches', async () => {
    visited.add('42'); await render();
    expect(highlighted()).toHaveLength(0);
    mocks.auth.user.id = '43'; await act(async () => publishAccount()); await render();
    expect(highlighted()).toHaveLength(2);
    mocks.auth.user.id = '42'; await act(async () => publishAccount()); await render();
    expect(highlighted()).toHaveLength(0);
  });
  it('hides disabled Playground and does not complete a redirected direct visit', async () => {
    mocks.auth.playgroundEnabled = false; publishAccount(); await render('/playground');
    expect(playgroundLinks()).toHaveLength(0);
    expect(host.querySelector('main h1')?.textContent).toBe('Dashboard fixture');
    expect(portalApi).not.toHaveBeenCalled();
  });
  it('preserves the highlight after a failed page render', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await render(); mocks.pageFails = true;
    await click(playgroundLinks()[0]!);
    expect(host.querySelector('main')?.textContent).toContain('Fixture route failed');
    expect(highlighted()).toHaveLength(2); expect(visited.size).toBe(0);
  });
  it('retains the sidebar highlight when collapsed and in the mobile navigation', async () => {
    await render();
    await click(host.querySelector<HTMLButtonElement>('button[aria-label="Collapse sidebar"]')!);
    expect(host.querySelector('.sidebar')?.classList.contains('sidebar-collapsed')).toBe(true);
    expect(highlighted()).toHaveLength(2);
    await click(host.querySelector<HTMLButtonElement>('button[aria-label="Open menu"]')!);
    expect(host.querySelector('.sidebar')?.classList.contains('sidebar-open')).toBe(true);
    expect(highlighted()).toHaveLength(2);
  });
});
