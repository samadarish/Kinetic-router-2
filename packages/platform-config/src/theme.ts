export const THEME_NAMES = ['dark', 'light'] as const;
export type ThemeName = typeof THEME_NAMES[number];
export const DEFAULT_THEME: ThemeName = 'dark';
export const THEME_STORAGE_KEY = 'kineticrouter-theme';
export const THEME_COOKIE_NAME = THEME_STORAGE_KEY;
export const THEME_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
const THEME_CHANGE_EVENT = 'kineticrouter:theme';

export function parseTheme(value: unknown): ThemeName | undefined {
  return value === 'dark' || value === 'light' ? value : undefined;
}

export function readStoredTheme(storage?: Pick<Storage, 'getItem'>): ThemeName {
  try { return parseTheme(storage?.getItem(THEME_STORAGE_KEY)) ?? DEFAULT_THEME; } catch { return DEFAULT_THEME; }
}

export function writeStoredTheme(storage: Pick<Storage, 'setItem'> | undefined, theme: ThemeName) {
  try { storage?.setItem(THEME_STORAGE_KEY, theme); } catch { /* Storage can be unavailable. */ }
}

export function readThemeCookie(cookie: string): ThemeName | undefined {
  for (const part of cookie.split(';')) {
    const [name, value] = part.trim().split('=');
    if (name === THEME_COOKIE_NAME) { const theme = parseTheme(value); if (theme) return theme; }
  }
  return undefined;
}

export function themeCookie(theme: ThemeName, location: Pick<Location, 'hostname' | 'protocol'>): string {
  const hostname = location.hostname.toLowerCase();
  const domain = hostname === 'kineticrouter.com' || hostname.endsWith('.kineticrouter.com') ? '; Domain=kineticrouter.com' : '';
  return `${THEME_COOKIE_NAME}=${theme}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax${domain}${location.protocol === 'https:' ? '; Secure' : ''}`;
}

type ThemeBrowser = Pick<Window, 'document' | 'location' | 'localStorage'>;
function browserStorage(browser: ThemeBrowser) { try { return browser.localStorage; } catch { return undefined; } }

export function readBrowserTheme(browser: ThemeBrowser | undefined = typeof window === 'undefined' ? undefined : window): ThemeName {
  if (!browser) return DEFAULT_THEME;
  let cookie: ThemeName | undefined;
  try { cookie = readThemeCookie(browser.document.cookie); } catch { /* Restricted cookies. */ }
  const storage = browserStorage(browser);
  const theme = cookie ?? readStoredTheme(storage);
  if (!cookie) { try { browser.document.cookie = themeCookie(theme, browser.location); } catch { /* Keep the local preference. */ } }
  writeStoredTheme(storage, theme);
  return theme;
}

export function setBrowserTheme(theme: ThemeName, browser: Window = window) {
  try { browser.document.cookie = themeCookie(theme, browser.location); } catch { /* Keep this tab usable. */ }
  writeStoredTheme(browserStorage(browser), theme);
  applyTheme(browser.document.documentElement, theme);
  browser.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function toggleBrowserTheme() { setBrowserTheme(nextTheme(readBrowserTheme())); }

export function getThemeSnapshot(): ThemeName {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('light') ? 'light' : DEFAULT_THEME;
}

/** Cookies are shared across hosts; focus and restoration reconcile idle tabs. */
export function subscribeTheme(change: () => void, browser: Window = window) {
  const sync = () => { applyTheme(browser.document.documentElement, readBrowserTheme(browser)); change(); };
  const visible = () => { if (!browser.document.hidden) sync(); };
  const stored = (event: StorageEvent) => { if (event.key === THEME_STORAGE_KEY || event.key === null) sync(); };
  browser.addEventListener(THEME_CHANGE_EVENT, sync);
  browser.addEventListener('focus', sync); browser.addEventListener('pageshow', sync);
  browser.addEventListener('storage', stored); browser.document.addEventListener('visibilitychange', visible);
  sync();
  return () => {
    browser.removeEventListener(THEME_CHANGE_EVENT, sync);
    browser.removeEventListener('focus', sync); browser.removeEventListener('pageshow', sync);
    browser.removeEventListener('storage', stored); browser.document.removeEventListener('visibilitychange', visible);
  };
}

export function applyTheme(root: Pick<HTMLElement, 'classList' | 'style'>, theme: ThemeName) {
  root.classList.remove('dark', 'light');
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

export function nextTheme(theme: ThemeName): ThemeName {
  return theme === 'dark' ? 'light' : 'dark';
}

export const THEME_BOOTSTRAP_SCRIPT = `(() => {
  const key = '${THEME_STORAGE_KEY}', valid = value => value === 'dark' || value === 'light';
  let theme;
  try { for (const part of document.cookie.split(';')) { const [name, value] = part.trim().split('='); if (name === key && valid(value)) { theme = value; break; } } } catch {}
  if (!theme) {
    try { const value = localStorage.getItem(key); if (valid(value)) theme = value; } catch {}
    theme = theme || '${DEFAULT_THEME}';
    try { const host = location.hostname.toLowerCase(); document.cookie = key + '=' + theme + '; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax' + (host === 'kineticrouter.com' || host.endsWith('.kineticrouter.com') ? '; Domain=kineticrouter.com' : '') + (location.protocol === 'https:' ? '; Secure' : ''); } catch {}
  }
  try { localStorage.setItem(key, theme); } catch {}
  const root = document.documentElement; root.classList.remove('dark', 'light'); root.classList.add(theme); root.style.colorScheme = theme;
})();`;
