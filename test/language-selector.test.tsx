// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageSelector } from '@kineticrouter/brand-ui';
import { LocaleProvider } from '@kineticrouter/i18n/react';
import { Fragment, jsx, jsxs } from '@kineticrouter/i18n/jsx-runtime';
import { LOCALE_STORAGE_KEY, setBrowserLocale } from '@kineticrouter/platform-config/locale';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear(); document.cookie = `${LOCALE_STORAGE_KEY}=en; Path=/`; document.documentElement.lang = 'en';
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe('language selector', () => {
  it('opens the ordered, checked menu and supports keyboard selection, Escape, and outside dismissal', async () => {
    await act(async () => root.render(createElement(LocaleProvider, { namespace: 'site', children: createElement(LanguageSelector) })));
    const trigger = host.querySelector<HTMLButtonElement>('.language-trigger')!;
    await act(async () => trigger.click());
    const options = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
    expect(options.map(option => option.textContent?.replace('✓', ''))).toEqual(['English', 'Español', 'Português', 'Bahasa Indonesia', 'Deutsch', 'Français', 'Русский', '한국어', '日本語', '简体中文']);
    expect(options[0]?.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(options[0]);
    await act(async () => options[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    expect(document.activeElement).toBe(options[9]);
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    await act(async () => trigger.click());
    await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(host.querySelector('[role="menu"]')).toBeNull();
    await act(async () => trigger.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[lang="es"]')!.click());
    expect(document.documentElement.lang).toBe('es');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('es');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('translates JSX text and labels while keeping code, user content, and input values intact', async () => {
    setBrowserLocale('es');
    const catalog = { Home: 'Inicio', 'Search models': 'Buscar modelos', '{0} results': '{0} resultados', Available: 'Disponible' };
    const content = jsxs('div', { children: [jsx('p', { children: 'Home' }), jsx('input', { placeholder: 'Search models', defaultValue: 'Home' }), jsx('code', { children: 'Home' }), jsx('div', { translate: 'no', children: jsx('span', { children: 'Home' }) }), jsxs('span', { 'data-testid': 'model-status', children: ['openai/model', ' · ', 'Available'] }), jsxs('p', { children: [7, ' results'] })] });
    await act(async () => root.render(createElement(LocaleProvider, { namespace: 'site', initialLocale: 'es', initialMessages: catalog, children: content })));
    expect(host.querySelector('p')?.textContent).toBe('Inicio');
    expect(host.querySelector('input')?.placeholder).toBe('Buscar modelos');
    expect(host.querySelector('input')?.value).toBe('Home');
    expect(host.querySelector('code')?.textContent).toBe('Home');
    expect(host.querySelector('[translate="no"]')?.textContent).toBe('Home');
    expect(host.querySelector('[data-testid="model-status"]')?.textContent).toBe('openai/model · Disponible');
    expect(host.querySelector('p:last-child')?.textContent).toBe('7 resultados');
  });

  it('translates text rendered by a router link without changing its destination', async () => {
    setBrowserLocale('es');
    function RouterLink(props: { to: string; children?: import('react').ReactNode }) { return createElement('a', { href: props.to }, props.children); }
    const content = jsx(RouterLink, { to: '/dashboard', children: 'Home' });
    await act(async () => root.render(createElement(LocaleProvider, { namespace: 'console', initialLocale: 'es', initialMessages: { Home: 'Inicio' }, children: content })));
    expect(host.querySelector('a')?.textContent).toBe('Inicio');
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/dashboard');
  });

  it('translates button labels inside fragments and preserves nested code', async () => {
    setBrowserLocale('es');
    const content = jsx('button', { children: jsxs(Fragment, { children: ['Sign in', jsx('code', { children: 'Sign in' })] }) });
    await act(async () => root.render(createElement(LocaleProvider, { namespace: 'console', initialLocale: 'es', initialMessages: { 'Sign in': 'Iniciar sesión' }, children: content })));
    expect(host.querySelector('button')?.textContent).toBe('Iniciar sesiónSign in');
    expect(host.querySelector('code')?.textContent).toBe('Sign in');
  });
});
