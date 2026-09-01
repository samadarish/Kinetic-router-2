import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { applyTheme, nextTheme, readStoredTheme, writeStoredTheme, type ThemeName } from '@kineticrouter/platform-config/theme';

const ThemeContext = createContext<{ theme: ThemeName; toggle(): void }>({ theme: 'dark', toggle: () => {} });

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<ThemeName>(() => readStoredTheme(typeof window === 'undefined' ? undefined : window.localStorage));

  useEffect(() => {
    applyTheme(document.documentElement, theme);
    try { writeStoredTheme(window.localStorage, theme); } catch { /* Storage can be unavailable. */ }
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, toggle: () => setTheme(nextTheme) }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
