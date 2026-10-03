// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CookieJar, JSDOM } from 'jsdom';
import {
  applyTheme, readBrowserTheme, readThemeCookie, setBrowserTheme, subscribeTheme,
  THEME_BOOTSTRAP_SCRIPT, THEME_STORAGE_KEY, themeCookie,
} from '@kineticrouter/platform-config/theme';

afterEach(() => { localStorage.clear(); document.cookie = `${THEME_STORAGE_KEY}=; Path=/; Max-Age=0`; vi.restoreAllMocks(); });

describe('shared theme preference', () => {
  it('uses a cookie before stale local storage and migrates only a valid legacy preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark'); document.cookie = `${THEME_STORAGE_KEY}=light; Path=/`;
    expect(readBrowserTheme()).toBe('light'); expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    document.cookie = `${THEME_STORAGE_KEY}=; Path=/; Max-Age=0`; localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(readBrowserTheme()).toBe('light'); expect(readThemeCookie(document.cookie)).toBe('light');
    document.cookie = `${THEME_STORAGE_KEY}=invalid; Path=/`; localStorage.setItem(THEME_STORAGE_KEY, 'invalid');
    expect(readBrowserTheme()).toBe('dark'); expect(readThemeCookie(document.cookie)).toBe('dark');
  });
  it('scopes production cookies to the apex and uses secure, year-long, same-site cookies', () => {
    for (const hostname of ['kineticrouter.com', 'console.kineticrouter.com', 'docs.kineticrouter.com']) {
      expect(themeCookie('light', { hostname, protocol: 'https:' })).toBe('kineticrouter-theme=light; Path=/; Max-Age=31536000; SameSite=Lax; Domain=kineticrouter.com; Secure');
    }
    for (const hostname of ['localhost', '127.0.0.1', 'kineticrouter.com.evil.test']) {
      expect(themeCookie('dark', { hostname, protocol: 'http:' })).toBe('kineticrouter-theme=dark; Path=/; Max-Age=31536000; SameSite=Lax');
    }
  });
  it('shares the authoritative preference in both directions across production hosts and restored pages', () => {
    const cookieJar = new CookieJar();
    const site = new JSDOM('<html class="dark"></html>', { url: 'https://kineticrouter.com', cookieJar, runScripts: 'outside-only' });
    const console = new JSDOM('<html class="dark"></html>', { url: 'https://console.kineticrouter.com', cookieJar, runScripts: 'outside-only' });
    site.window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(readBrowserTheme(site.window as unknown as Window)).toBe('light');
    expect(readBrowserTheme(console.window as unknown as Window)).toBe('light');
    setBrowserTheme('dark', console.window as unknown as Window);
    site.window.eval(THEME_BOOTSTRAP_SCRIPT);
    expect(site.window.document.documentElement.className).toBe('dark');
    expect(site.window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    setBrowserTheme('light', site.window as unknown as Window);
    console.window.eval(THEME_BOOTSTRAP_SCRIPT);
    expect(console.window.document.documentElement.className).toBe('light');
    expect(console.window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    site.window.close(); console.window.close();
  });
  it('synchronizes toggles, focused and restored tabs, and releases listeners', () => {
    const change = vi.fn(), stop = subscribeTheme(change);
    setBrowserTheme('light'); expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(readThemeCookie(document.cookie)).toBe('light');
    for (const name of ['focus', 'pageshow', 'visibilitychange']) {
      document.cookie = `${THEME_STORAGE_KEY}=dark; Path=/`; localStorage.setItem(THEME_STORAGE_KEY, 'light');
      (name === 'visibilitychange' ? document : window).dispatchEvent(new Event(name));
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    }
    stop(); const calls = change.mock.calls.length;
    window.dispatchEvent(new Event('focus')); expect(change).toHaveBeenCalledTimes(calls);
  });
  it('bootstraps the same authoritative preference with unavailable storage', () => {
    document.cookie = `${THEME_STORAGE_KEY}=light; Path=/`;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('disabled'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disabled'); });
    applyTheme(document.documentElement, 'dark');
    window.eval(THEME_BOOTSTRAP_SCRIPT);
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(readBrowserTheme()).toBe('light');
  });
});
