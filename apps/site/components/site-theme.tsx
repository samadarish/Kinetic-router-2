'use client';

import { useEffect } from 'react';
import { applyTheme, readStoredTheme } from '@kineticrouter/platform-config/theme';

export function SiteTheme() {
  useEffect(() => {
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Dark remains the safe default. */ }
    applyTheme(document.documentElement, readStoredTheme(storage));
  }, []);

  return null;
}
