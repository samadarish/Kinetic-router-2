'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { resolvePublicConsoleOrigin } from '@/data/public-console-origin.mjs';
import { createPublicSessionCache, pendingPublicSession } from '@/data/public-session-cache.mjs';

const caches = new Map<string, ReturnType<typeof createPublicSessionCache>>();
const serverSnapshot = () => pendingPublicSession;

export function usePublicSession() {
  const consoleOrigin = useMemo(() => resolvePublicConsoleOrigin(
    process.env.NEXT_PUBLIC_KINETICROUTER_CONSOLE_ORIGIN,
    typeof window === 'undefined' ? undefined : window.location.origin,
    process.env.NODE_ENV === 'development',
  ), []);
  const cache = useMemo(() => {
    let value = caches.get(consoleOrigin);
    if (!value) { value = createPublicSessionCache(consoleOrigin); caches.set(consoleOrigin, value); }
    return value;
  }, [consoleOrigin]);
  const snapshot = useSyncExternalStore(cache.subscribe, cache.getSnapshot, serverSnapshot);
  useEffect(() => cache.watch({ window, document }), [cache]);
  return { ...snapshot, consoleOrigin, signedOut: cache.signedOut };
}
