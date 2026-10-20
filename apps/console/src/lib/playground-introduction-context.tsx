import { createContext, useContext, useLayoutEffect, useMemo, useSyncExternalStore, type PropsWithChildren } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SessionView } from '@kineticrouter/portal-contract';
import { jsonBody, portalApi } from './api';
import { createPlaygroundIntroduction, introductionStorage, parsePlaygroundIntroduction } from './playground-introduction';

const IntroductionContext = createContext({ highlight: false, visit: () => {} });

export function PlaygroundIntroductionProvider({ userId, enabled, children }: PropsWithChildren<{ userId: string; enabled: boolean }>) {
  const client = useQueryClient();
  const store = useMemo(() => createPlaygroundIntroduction({
    userId,
    storage: introductionStorage(),
    isOwner: () => {
      const session = client.getQueryData<SessionView>(['session']);
      return enabled && session?.authenticated === true && session.user?.id === userId && session.playgroundEnabled === true;
    },
    read: async signal => parsePlaygroundIntroduction(await portalApi('/me/playground-introduction', { signal }, 5000)),
    save: async signal => parsePlaygroundIntroduction(await portalApi('/me/playground-introduction/visited', { method: 'POST', ...jsonBody({}), signal }, 5000)),
  }), [client, userId, enabled]);
  const visited = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useLayoutEffect(() => {
    const unwatch = store.watch(window);
    const unsubscribe = client.getQueryCache().subscribe(event => {
      if (event.query.queryKey[0] !== 'session') return;
      const session = client.getQueryData<SessionView>(['session']);
      if (!session?.authenticated || session.user?.id !== userId || !session.playgroundEnabled) store.stop();
    });
    return () => { unsubscribe(); unwatch(); };
  }, [store, client, userId]);
  const value = useMemo(() => ({ highlight: enabled && visited === false, visit: store.visit }), [enabled, visited, store]);
  return <IntroductionContext.Provider value={value}>{children}</IntroductionContext.Provider>;
}

export const usePlaygroundIntroduction = () => useContext(IntroductionContext);
