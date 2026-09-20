import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOCIAL_PLATFORMS, type SocialLinks } from '@kineticrouter/portal-contract';
import { SocialIcon } from '@kineticrouter/brand-ui';
import { loadWelcomeSocialLinks, WelcomeSocialLinks, welcomeBubbleIsVisible } from './WelcomeMessageContent';

const api = vi.hoisted(() => vi.fn());
vi.mock('../lib/api', () => ({ portalApi: api, jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }) }));
const blank: SocialLinks = { telegram: '', whatsapp: '', instagram: '', facebook: '', x: '' };
beforeEach(() => api.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe('welcome social links', () => {
  it('renders only configured links with shared glyphs and clear accessible labels', () => {
    const links = { ...blank, telegram: 'https://t.me/example', x: 'https://x.com/example' };
    const html = renderToStaticMarkup(<WelcomeSocialLinks links={links} />);
    expect(html).toContain('href="https://t.me/example"');
    expect(html).toContain('aria-label="kineticRouter on Telegram"');
    expect(html).toContain('>Telegram</span>');
    expect(html).toContain('>X</span>');
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html.match(/<svg/g)).toHaveLength(2);
    expect(html).not.toContain('Facebook');
    for (const { id } of SOCIAL_PLATFORMS) {
      const glyph = renderToStaticMarkup(<SocialIcon platform={id} />);
      expect(glyph).toContain('aria-hidden="true" focusable="false"');
      expect(glyph).toMatch(/<path d=".{20,}"/);
    }
  });

  it('does not revive default links when settings are cleared, absent, malformed, or unavailable', async () => {
    for (const links of [blank, null, undefined]) expect(renderToStaticMarkup(<WelcomeSocialLinks links={links} />)).toBe('');
    api.mockResolvedValueOnce({ socialLinks: blank });
    expect(await loadWelcomeSocialLinks()).toEqual(blank);
    api.mockResolvedValueOnce({ socialLinks: { ...blank, x: 'javascript:alert(1)' } });
    expect(await loadWelcomeSocialLinks()).toBeNull();
    api.mockResolvedValueOnce({});
    expect(await loadWelcomeSocialLinks()).toBeNull();
    api.mockRejectedValueOnce(new Error('Unavailable'));
    expect(await loadWelcomeSocialLinks()).toBeNull();
    expect(api).toHaveBeenLastCalledWith('/website', { signal: undefined }, 5000);
  });
});

describe('actual welcome bubble visibility', () => {
  function fixture() {
    const state = { focused: true, visibility: 'visible', connected: true, hidden: false, inert: false, modal: false, covered: false,
      rect: { left: 100, right: 400, top: 100, bottom: 300, height: 200 }, scroll: { left: 0, right: 500, top: 50, bottom: 700 } };
    const bubble = { get isConnected() { return state.connected; },
      closest: (selector: string) => selector.startsWith('[inert]') ? (state.inert ? {} : null) : { getBoundingClientRect: () => state.scroll },
      getClientRects: () => state.hidden ? [] : [state.rect], getBoundingClientRect: () => state.rect,
      contains: (node: unknown) => node === bubble,
    } as unknown as HTMLElement;
    vi.stubGlobal('document', { get visibilityState() { return state.visibility; }, hasFocus: () => state.focused,
      querySelectorAll: () => state.modal ? [{ getClientRects: () => [{}] }] : [],
      elementFromPoint: () => state.covered ? {} : bubble });
    vi.stubGlobal('getComputedStyle', () => ({ visibility: 'visible', display: 'block', opacity: '1' }));
    vi.stubGlobal('innerWidth', 800); vi.stubGlobal('innerHeight', 800);
    return { state, bubble };
  }
  it('rejects unfocused, hidden, detached, inert, modal-covered, and occluded bubbles', () => {
    const { state, bubble } = fixture();
    expect(welcomeBubbleIsVisible(bubble)).toBe(true);
    for (const key of ['focused', 'connected'] as const) { state[key] = false; expect(welcomeBubbleIsVisible(bubble)).toBe(false); state[key] = true; }
    for (const key of ['hidden', 'inert', 'modal', 'covered'] as const) { state[key] = true; expect(welcomeBubbleIsVisible(bubble)).toBe(false); state[key] = false; }
    state.visibility = 'hidden'; expect(welcomeBubbleIsVisible(bubble)).toBe(false);
  });
  it('requires a meaningful visible area inside the scrolling conversation, including short welcome bubbles', () => {
    const { state, bubble } = fixture();
    state.rect = { left: 100, right: 400, top: -80, bottom: 120, height: 200 };
    expect(welcomeBubbleIsVisible(bubble)).toBe(true);
    state.rect.top--; state.rect.bottom--; expect(welcomeBubbleIsVisible(bubble)).toBe(false);
    state.rect = { left: 100, right: 400, top: 90, bottom: 130, height: 40 };
    expect(welcomeBubbleIsVisible(bubble)).toBe(true);
    state.rect = { left: 900, right: 1200, top: 90, bottom: 130, height: 40 };
    expect(welcomeBubbleIsVisible(bubble)).toBe(false);
  });
});
