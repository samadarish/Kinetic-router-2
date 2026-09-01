'use client';

import { useEffect } from 'react';

type SiteThemeName = 'dark' | 'light';

function applyTheme(theme: SiteThemeName) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
  root.style.colorScheme = theme;
}

export function SiteTheme() {
  useEffect(() => {
    let theme: SiteThemeName = 'dark';
    try {
      const stored = localStorage.getItem('kineticrouter-theme');
      if (stored === 'light' || stored === 'dark') theme = stored;
    } catch {
      // Storage can be unavailable in privacy-restricted browsers; dark mode remains the safe default.
    }
    applyTheme(theme);
  }, []);

  return null;
}
