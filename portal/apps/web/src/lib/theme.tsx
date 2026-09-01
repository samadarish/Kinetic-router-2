import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

type Theme = 'dark' | 'light';
const ThemeContext = createContext<{ theme: Theme; toggle(): void }>({ theme: 'dark', toggle: () => {} });

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme() ?? 'dark');

  useEffect(() => {
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(theme);
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem('kineticrouter-theme', theme); } catch { /* Storage can be unavailable. */ }
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, toggle: () => setTheme((value) => value === 'dark' ? 'light' : 'dark') }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem('kineticrouter-theme');
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}
