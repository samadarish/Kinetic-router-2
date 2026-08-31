'use client';

import { useEffect } from 'react';
import type { SiteContentDocument } from '@/data/site-content';

type SiteThemeName = SiteContentDocument['theme']['defaultTheme'];

function applyTheme(theme: SiteThemeName) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
  root.style.colorScheme = theme;
}

export function SiteTheme({ defaultTheme }: { defaultTheme: SiteThemeName }) {
  useEffect(() => {
    let theme = defaultTheme;
    try {
      const stored = localStorage.getItem('kineticrouter-theme');
      if (stored === 'light' || stored === 'dark') theme = stored;
    } catch {
      // Storage can be unavailable in privacy-restricted browsers; the published default remains safe.
    }
    applyTheme(theme);
  }, [defaultTheme]);

  return null;
}
