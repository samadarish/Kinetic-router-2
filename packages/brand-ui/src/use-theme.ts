'use client';

import { useSyncExternalStore } from 'react';
import { DEFAULT_THEME, getThemeSnapshot, subscribeTheme, toggleBrowserTheme } from '@kineticrouter/platform-config/theme';

export function useThemePreference() {
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => DEFAULT_THEME);
  return { theme, toggle: toggleBrowserTheme };
}
