// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CookieJar, JSDOM } from 'jsdom';
import { DEFAULT_LOCALE, LOCALE_BOOTSTRAP_SCRIPT, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, detectLanguage, localeCookie, parseLocale, readBrowserLocale, readLocaleCookie, resolveRequestLocale, setBrowserLocale, subscribeLocale } from '@kineticrouter/platform-config/locale';

afterEach(() => {
  localStorage.clear();
  document.cookie = `${LOCALE_STORAGE_KEY}=; Path=/; Max-Age=0`;
  document.documentElement.lang = 'en';
  vi.restoreAllMocks();
});

describe('shared language preference', () => {
  it('retains English as the fallback and first menu option, with native Vietnamese last', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(readBrowserLocale()).toBe('en');
    expect(SUPPORTED_LOCALES.map(locale => locale.label)).toEqual(['English', 'Español', 'Português', 'Bahasa Indonesia', 'Deutsch', 'Français', 'Русский', '한국어', '日本語', '简体中文', 'Tiếng Việt']);
    expect(parseLocale('zh-CN')).toBe('zh-CN');
    expect(parseLocale('vi')).toBe('vi');
    expect(parseLocale('not-a-language')).toBeUndefined();
  });

  it.each([
    ['en-US', 'en'], ['es-MX', 'es'], ['pt-BR', 'pt'], ['fr-CA', 'fr'], ['de-DE', 'de'],
    ['id-ID', 'id'], ['ru-RU', 'ru'], ['ko-KR', 'ko'], ['ja-JP', 'ja'], ['vi-VN', 'vi'],
    ['VI-vn', 'vi'], ['zh', 'zh-CN'], ['zh-CN', 'zh-CN'], ['zh-SG', 'zh-CN'],
    ['zh-Hans', 'zh-CN'], ['zh-Hans-TW', 'zh-CN'], ['zh-TW', 'en'], ['zh-HK', 'en'],
    ['zh-Hant', 'en'], ['hi-IN', 'en'], ['nl-NL', 'en'], ['', 'en'], ['en--US', 'en'],
  ])('agrees during browser bootstrap and runtime for primary language %s', (language, expected) => {
    expect(detectLanguage(language)).toBe(expected);
    for (const bootstrap of [false, true]) {
      const browser = new JSDOM('<html lang="en"></html>', { url: 'https://kineticrouter.com', runScripts: 'outside-only' });
      Object.defineProperty(browser.window.navigator, 'languages', { value: [language, 'es-ES'], configurable: true });
      Object.defineProperty(browser.window.navigator, 'language', { value: 'en-US', configurable: true });
      if (bootstrap) browser.window.eval(LOCALE_BOOTSTRAP_SCRIPT);
      else expect(readBrowserLocale(browser.window as unknown as Window)).toBe(expected);
      if (bootstrap) expect(browser.window.document.documentElement.lang).toBe(expected);
      expect(readLocaleCookie(browser.window.document.cookie)).toBe(expected);
      expect(browser.window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe(expected);
      browser.window.close();
    }
  });

  it('uses navigator.language when the browser preference list is empty', () => {
    for (const bootstrap of [false, true]) {
      const browser = new JSDOM('<html lang="en"></html>', { url: 'https://fallback.test', runScripts: 'outside-only' });
      Object.defineProperty(browser.window.navigator, 'languages', { value: [], configurable: true });
      Object.defineProperty(browser.window.navigator, 'language', { value: 'fr-CA', configurable: true });
      if (bootstrap) browser.window.eval(LOCALE_BOOTSTRAP_SCRIPT);
      expect(readBrowserLocale(browser.window as unknown as Window)).toBe('fr');
      browser.window.close();
    }
    for (const value of [undefined, null, 123, {}]) expect(detectLanguage(value)).toBe('en');
  });

  it.each([
    [null, 'en'], ['', 'en'], ['vi-VN, en;q=0.9', 'vi'], ['en;q=0.5, fr-CA;q=0.9', 'fr'],
    ['hi-IN, fr;q=0.9', 'en'], ['zh-Hant, zh-CN;q=0.9', 'en'], ['de;q=0, vi-VN;q=0.8', 'vi'],
    ['fr;q=0.8, de;q=0.8', 'fr'], ['fr;q=2, vi;q=0.9', 'vi'], ['fr;q=bad', 'en'],
    ['*', 'en'], ['not_a_locale', 'en'],
  ])('uses the primary request preference for server rendering: %s', (header, expected) => {
    expect(resolveRequestLocale(undefined, header)).toBe(expected);
    expect(resolveRequestLocale('en', header)).toBe('en');
    expect(resolveRequestLocale('vi', header)).toBe('vi');
    expect(resolveRequestLocale('invalid', header)).toBe(expected);
  });

  it('preserves an existing saved English preference over automatic detection', () => {
    for (const cookie of [true, false]) {
      const browser = new JSDOM('<html lang="en"></html>', { url: 'https://saved.test', runScripts: 'outside-only' });
      Object.defineProperty(browser.window.navigator, 'languages', { value: ['vi-VN'], configurable: true });
      if (cookie) browser.window.document.cookie = `${LOCALE_STORAGE_KEY}=en; Path=/`;
      else browser.window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
      browser.window.eval(LOCALE_BOOTSTRAP_SCRIPT);
      expect(readBrowserLocale(browser.window as unknown as Window)).toBe('en');
      expect(browser.window.document.documentElement.lang).toBe('en');
      browser.window.close();
    }
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
    Object.defineProperty(site.window.navigator, 'languages', { value: ['vi-VN'], configurable: true });
    Object.defineProperty(consoleSite.window.navigator, 'languages', { value: ['ja-JP'], configurable: true });
    expect(readBrowserLocale(site.window as unknown as Window)).toBe('vi');
    expect(readBrowserLocale(consoleSite.window as unknown as Window)).toBe('vi');
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
    Object.defineProperty(browser.window.navigator, 'languages', { value: ['vi-VN'], configurable: true });
    expect(readBrowserLocale(browser.window as unknown as Window)).toBe('vi');
    setBrowserLocale('pt', browser.window as unknown as Window);
    expect(readBrowserLocale(browser.window as unknown as Window)).toBe('pt');
    expect(browser.window.document.documentElement.lang).toBe('pt');
    browser.window.close();
  });
});
