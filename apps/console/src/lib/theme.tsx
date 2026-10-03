import { createContext, useContext, type PropsWithChildren } from 'react';
import { useThemePreference } from '@kineticrouter/brand-ui';
import type { ThemeName } from '@kineticrouter/platform-config/theme';

const ThemeContext = createContext<{ theme: ThemeName; toggle(): void }>({ theme: 'dark', toggle: () => {} });

export function ThemeProvider({ children }: PropsWithChildren) {
  const value = useThemePreference();
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
