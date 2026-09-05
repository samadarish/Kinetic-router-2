import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { analyticsIdentityChanged, startAnalytics } from '@kineticrouter/analytics-client';
import { useAuth } from '../lib/auth';

export function AnalyticsTracker() {
  const { pathname } = useLocation();
  const auth = useAuth();
  const previous = useRef<string | undefined>(undefined);
  const identity = auth.loading ? 'loading' : auth.user?.id ?? 'anonymous';
  useEffect(() => {
    if (auth.loading) return;
    if (!/^\/(sign-in|dashboard|api-keys|usage|status|subscriptions|redeem|profile|analytics)$/.test(pathname)) return;
    startAnalytics({ consoleOrigin: location.origin, surface: 'console' })?.navigate(pathname);
    if (previous.current !== undefined && previous.current !== identity) analyticsIdentityChanged();
    previous.current = identity;
  }, [pathname, identity, auth.loading]);
  return null;
}
