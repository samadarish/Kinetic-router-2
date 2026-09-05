'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { startAnalytics } from '@kineticrouter/analytics-client';
import { resolvePublicConsoleOrigin } from '@/data/public-console-origin.mjs';

export function AnalyticsTracker() {
  const pathname = usePathname();
  useEffect(() => {
    // Preview domains must not contribute to production analytics.
    if (!['kineticrouter.com', 'www.kineticrouter.com', 'localhost', '127.0.0.1'].includes(location.hostname)) return;
    const consoleOrigin = resolvePublicConsoleOrigin(process.env.NEXT_PUBLIC_KINETICROUTER_CONSOLE_ORIGIN, location.origin, process.env.NODE_ENV === 'development');
    startAnalytics({ consoleOrigin, surface: 'site' })?.navigate(pathname || location.pathname);
  }, [pathname]);
  return null;
}
