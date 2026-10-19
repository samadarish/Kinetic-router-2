export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'ru', label: 'Русский' },
  { code: 'ko', label: '한국어' },
  { code: 'ja', label: '日本語' },
  { code: 'zh-CN', label: '简体中文' },
] as const;

export type Locale = typeof SUPPORTED_LOCALES[number]['code'];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_STORAGE_KEY = 'kineticrouter-language';
export const LOCALE_COOKIE_NAME = LOCALE_STORAGE_KEY;
export const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
const LOCALE_CHANGE_EVENT = 'kineticrouter:language';
const memory = new WeakMap<object, Locale>();

export function parseLocale(value: unknown): Locale | undefined {
  return SUPPORTED_LOCALES.find(locale => locale.code === value)?.code;
}

export function readLocaleCookie(cookie: string): Locale | undefined {
  for (const part of cookie.split(';')) {
    const [name, value] = part.trim().split('=');
    if (name === LOCALE_COOKIE_NAME) return parseLocale(value);
  }
  return undefined;
}

export function localeCookie(locale: Locale, location: Pick<Location, 'hostname' | 'protocol'>) {
  const hostname = location.hostname.toLowerCase();
  const domain = hostname === 'kineticrouter.com' || hostname.endsWith('.kineticrouter.com') ? '; Domain=kineticrouter.com' : '';
  return `${LOCALE_COOKIE_NAME}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${domain}${location.protocol === 'https:' ? '; Secure' : ''}`;
}

type LocaleBrowser = Pick<Window, 'document' | 'location' | 'localStorage'>;

export function readBrowserLocale(browser: LocaleBrowser | undefined = typeof window === 'undefined' ? undefined : window): Locale {
  if (!browser) return DEFAULT_LOCALE;
  let locale: Locale | undefined;
  try { locale = readLocaleCookie(browser.document.cookie); } catch { /* Restricted cookies. */ }
  if (!locale) {
    try { locale = parseLocale(browser.localStorage.getItem(LOCALE_STORAGE_KEY)); } catch { /* Restricted storage. */ }
    locale ??= memory.get(browser) ?? DEFAULT_LOCALE;
    try { browser.document.cookie = localeCookie(locale, browser.location); } catch { /* Retain this tab's choice. */ }
  }
  memory.set(browser, locale);
  try { browser.localStorage.setItem(LOCALE_STORAGE_KEY, locale); } catch { /* Retain this tab's choice. */ }
  return locale;
}

export function applyLocale(root: Pick<HTMLElement, 'lang'>, locale: Locale) { root.lang = locale; }

export function setBrowserLocale(value: Locale, browser: Window = window) {
  const locale = parseLocale(value);
  if (!locale) return;
  memory.set(browser, locale);
  try { browser.document.cookie = localeCookie(locale, browser.location); } catch { /* Restricted cookies. */ }
  try { browser.localStorage.setItem(LOCALE_STORAGE_KEY, locale); } catch { /* Restricted storage. */ }
  applyLocale(browser.document.documentElement, locale);
  browser.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
}

export function getLocaleSnapshot(): Locale {
  return typeof document === 'undefined' ? DEFAULT_LOCALE : parseLocale(document.documentElement.lang) ?? DEFAULT_LOCALE;
}

/** The cookie is authoritative across subdomains; local storage also syncs same-origin tabs. */
export function subscribeLocale(change: () => void, browser: Window = window) {
  const sync = () => {
    const locale = readBrowserLocale(browser);
    if (browser.document.documentElement.lang !== locale) applyLocale(browser.document.documentElement, locale);
    change();
  };
  const visible = () => { if (!browser.document.hidden) sync(); };
  const stored = (event: StorageEvent) => { if (event.key === LOCALE_STORAGE_KEY || event.key === null) sync(); };
  browser.addEventListener(LOCALE_CHANGE_EVENT, sync);
  browser.addEventListener('focus', sync);
  browser.addEventListener('pageshow', sync);
  browser.addEventListener('storage', stored);
  browser.document.addEventListener('visibilitychange', visible);
  // Cookie changes do not dispatch storage events on a sibling subdomain. Poll
  // visible windows too, so two side-by-side sites agree without a focus change.
  const timer = browser.setInterval(visible, 1000);
  sync();
  return () => {
    browser.clearInterval(timer);
    browser.removeEventListener(LOCALE_CHANGE_EVENT, sync);
    browser.removeEventListener('focus', sync);
    browser.removeEventListener('pageshow', sync);
    browser.removeEventListener('storage', stored);
    browser.document.removeEventListener('visibilitychange', visible);
  };
}

export const LOCALE_BOOTSTRAP_SCRIPT = `(() => {
  const key = '${LOCALE_STORAGE_KEY}', valid = value => ${JSON.stringify(SUPPORTED_LOCALES.map(locale => locale.code))}.includes(value);
  let locale;
  try { for (const part of document.cookie.split(';')) { const [name, value] = part.trim().split('='); if (name === key && valid(value)) { locale = value; break; } } } catch {}
  if (!locale) {
    try { const stored = localStorage.getItem(key); if (valid(stored)) locale = stored; } catch {}
    locale = locale || '${DEFAULT_LOCALE}';
    try { const host = location.hostname.toLowerCase(); document.cookie = key + '=' + locale + '; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax' + (host === 'kineticrouter.com' || host.endsWith('.kineticrouter.com') ? '; Domain=kineticrouter.com' : '') + (location.protocol === 'https:' ? '; Secure' : ''); } catch {}
  }
  try { localStorage.setItem(key, locale); } catch {}
  document.documentElement.lang = locale;
})();`;
