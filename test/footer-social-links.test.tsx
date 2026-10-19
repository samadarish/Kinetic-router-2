// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FooterSocialLinks } from '../apps/site/components/footer-social-links';

const state = vi.hoisted(() => ({
  loaded: false,
  session: null as null | { authenticated: true; user: { id: string; username: string; role?: string } },
  consoleOrigin: 'https://console.example.test',
}));
vi.mock('../apps/site/components/use-public-session', () => ({ usePublicSession: () => state }));
const links = { telegram: 'https://t.me/example', whatsapp: '', instagram: '', facebook: '', x: 'https://x.com/example' };
const response = (socialLinks = links) => Response.json({ ok: true, data: { socialLinks } });
let host: HTMLDivElement, root: Root;
const fetcher = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', fetcher);
  fetcher.mockReset();
  state.loaded = false; state.session = null;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const render = () => act(async () => root.render(<FooterSocialLinks />));
function signIn(id = '42', role = 'user') { state.loaded = true; state.session = { authenticated: true, user: { id, username: 'Fixture', role } }; }
function deferred() { let resolve!: (value: Response) => void; const promise = new Promise<Response>(done => { resolve = done; }); return { promise, resolve }; }

describe('signed-in footer social links', () => {
  it('keeps pending and signed-out HTML free of social URLs and never requests them', async () => {
    expect(renderToStaticMarkup(<FooterSocialLinks />)).toBe('');
    await render();
    state.loaded = true; await render();
    expect(host.innerHTML).toBe('');
    expect(renderToStaticMarkup(<FooterSocialLinks />)).toBe('');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['user', 'admin'])('loads configured URLs for a signed-in %s', async role => {
    fetcher.mockResolvedValue(response());
    signIn('42', role); await render();
    expect(fetcher).toHaveBeenCalledWith(`${state.consoleOrigin}/portal/v1/website`, expect.objectContaining({ credentials: 'include', cache: 'no-store' }));
    expect([...host.querySelectorAll('a')].map(a => a.href)).toEqual([links.telegram, links.x]);
    expect(host.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(host.innerHTML).not.toContain('Facebook');
    state.session = null; await render();
    expect(host.innerHTML).toBe('');
  });
  it('aborts on logout and ignores a late response even after another login', async () => {
    const old = deferred(), fresh = deferred();
    fetcher.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    signIn(); await render();
    const signal = fetcher.mock.calls[0]![1]!.signal!;
    state.session = null; await render();
    expect(signal.aborted).toBe(true);
    signIn(); await render();
    await act(async () => old.resolve(response()));
    expect(host.innerHTML).toBe('');
    await act(async () => fresh.resolve(response({ ...links, x: 'https://x.com/fresh' })));
    expect(host.innerHTML).toContain('https://x.com/fresh');
    expect(host.innerHTML).not.toContain('https://x.com/example');
  });
  it('clears previous links and aborts old reads when switching accounts', async () => {
    const old = deferred(), fresh = deferred();
    fetcher.mockResolvedValueOnce(response()).mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    signIn(); await render();
    expect(host.innerHTML).toContain(links.x);
    signIn('43'); await render();
    expect(host.innerHTML).toBe('');
    const signal = fetcher.mock.calls[1]![1]!.signal!;
    signIn('44'); await render();
    expect(signal.aborted).toBe(true);
    await act(async () => old.resolve(response()));
    expect(host.innerHTML).toBe('');
    await act(async () => fresh.resolve(response({ ...links, x: 'https://x.com/current' })));
    expect(host.innerHTML).toContain('https://x.com/current');
    expect(host.innerHTML).not.toContain(links.x);
  });
  it.each([401, 503])('hides the row when settings return %s', async status => {
    fetcher.mockResolvedValue(Response.json({}, { status }));
    signIn(); await render();
    expect(host.innerHTML).toBe('');
  });
});
