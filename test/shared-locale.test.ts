// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CookieJar, JSDOM } from 'jsdom';
import { DEFAULT_LOCALE, LOCALE_BOOTSTRAP_SCRIPT, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, localeCookie, parseLocale, readBrowserLocale, readLocaleCookie, setBrowserLocale, subscribeLocale } from '@kineticrouter/platform-config/locale';

afterEach(() => {
  localStorage.clear();
  document.cookie = `${LOCALE_STORAGE_KEY}=; Path=/; Max-Age=0`;
  document.documentElement.lang = 'en';
  vi.restoreAllMocks();
});

describe('shared language preference', () => {
  it('defaults to English and keeps the requested menu order', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(readBrowserLocale()).toBe('en');
    expect(SUPPORTED_LOCALES.map(locale => locale.label)).toEqual(['English', 'Español', 'Português', 'Bahasa Indonesia', 'Deutsch', 'Français', 'Русский', '한국어', '日本語', '简体中文']);
    expect(parseLocale('zh-CN')).toBe('zh-CN');
    expect(parseLocale('not-a-language')).toBeUndefined();
  });

  it('lets a valid shared cookie override stale local storage and rejects invalid values', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'de');
    document.cookie = `${LOCALE_STORAGE_KEY}=ja; Path=/`;
    expect(readBrowserLocale()).toBe('ja');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ja');
    document.cookie = `${LOCALE_STORAGE_KEY}=invalid; Path=/`;
    localStorage.setItem(LOCALE_STORAGE_KEY, 'invalid');
    expect(readLocaleCookie(document.cookie)).toBeUndefined();
    expect(localeCookie('es', { hostname: 'console.kineticrouter.com', protocol: 'https:' })).toBe('kineticrouter-language=es; Path=/; Max-Age=31536000; SameSite=Lax; Domain=kineticrouter.com; Secure');
    expect(localeCookie('es', { hostname: 'kineticrouter.com.evil.test', protocol: 'http:' })).not.toContain('Domain=');
  });

  it('synchronizes in both directions across production subdomains and bootstraps restored pages', () => {
    const cookieJar = new CookieJar();
    const site = new JSDOM('<html lang="en"></html>', { url: 'https://kineticrouter.com', cookieJar, runScripts: 'outside-only' });
    const consoleSite = new JSDOM('<html lang="en"></html>', { url: 'https://console.kineticrouter.com', cookieJar, runScripts: 'outside-only' });
    setBrowserLocale('fr', site.window as unknown as Window);
    expect(readBrowserLocale(consoleSite.window as unknown as Window)).toBe('fr');
    setBrowserLocale('ko', consoleSite.window as unknown as Window);
    site.window.eval(LOCALE_BOOTSTRAP_SCRIPT);
    expect(site.window.document.documentElement.lang).toBe('ko');
    expect(site.window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ko');
    site.window.close(); consoleSite.window.close();
  });

  it('updates focused tabs and releases listeners and polling on unmount', () => {
    vi.useFakeTimers();
    const change = vi.fn();
    const stop = subscribeLocale(change);
    setBrowserLocale('es');
    expect(document.documentElement.lang).toBe('es');
    document.cookie = `${LOCALE_STORAGE_KEY}=ru; Path=/`;
    window.dispatchEvent(new Event('focus'));
    expect(document.documentElement.lang).toBe('ru');
    stop();
    const calls = change.mock.calls.length;
    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(3000);
    expect(change).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('keeps the current tab usable when cookies and local storage are unavailable', () => {
    const browser = new JSDOM('<html lang="en"></html>', { url: 'https://restricted.test' });
    Object.defineProperty(browser.window.document, 'cookie', { configurable: true, get() { throw new Error('disabled'); }, set() { throw new Error('disabled'); } });
    Object.defineProperty(browser.window, 'localStorage', { configurable: true, get() { throw new Error('disabled'); } });
    setBrowserLocale('pt', browser.window as unknown as Window);
    expect(readBrowserLocale(browser.window as unknown as Window)).toBe('pt');
    expect(browser.window.document.documentElement.lang).toBe('pt');
    browser.window.close();
  });
});
