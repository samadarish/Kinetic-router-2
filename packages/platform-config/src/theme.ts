export const THEME_NAMES = ['dark', 'light'] as const;
export type ThemeName = typeof THEME_NAMES[number];
export const DEFAULT_THEME: ThemeName = 'dark';
export const THEME_STORAGE_KEY = 'kineticrouter-theme';

export function parseTheme(value: unknown): ThemeName | undefined {
  return value === 'dark' || value === 'light' ? value : undefined;
}

export function readStoredTheme(storage?: Pick<Storage, 'getItem'>): ThemeName {
  try { return parseTheme(storage?.getItem(THEME_STORAGE_KEY)) ?? DEFAULT_THEME; } catch { return DEFAULT_THEME; }
}

export function writeStoredTheme(storage: Pick<Storage, 'setItem'> | undefined, theme: ThemeName) {
  try { storage?.setItem(THEME_STORAGE_KEY, theme); } catch { /* Storage can be unavailable. */ }
}

export function applyTheme(root: Pick<HTMLElement, 'classList' | 'style'>, theme: ThemeName) {
  root.classList.remove('dark', 'light');
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

export function nextTheme(theme: ThemeName): ThemeName {
  return theme === 'dark' ? 'light' : 'dark';
}

export const THEME_BOOTSTRAP_SCRIPT = `(() => { try { const key = '${THEME_STORAGE_KEY}'; const value = localStorage.getItem(key); const theme = value === 'light' ? 'light' : 'dark'; const root = document.documentElement; root.classList.remove('dark', 'light'); root.classList.add(theme); root.style.colorScheme = theme; } catch { document.documentElement.classList.add('${DEFAULT_THEME}'); document.documentElement.style.colorScheme = '${DEFAULT_THEME}'; } })();`;
