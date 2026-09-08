import { createContext, useContext, useEffect, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SessionView } from '@kineticrouter/portal-contract';
import { jsonBody, portalApi, queryString, streamPlayground } from './api';
import { refreshPlaygroundBilling } from './playground-state';
import { browserPlaygroundStorage } from './playground-storage';
import { createConversationController, type ConversationController, type HistoryApi } from './playground-conversations';

const historyApi: HistoryApi = {
  list: cursor => portalApi(`/playground/conversations${queryString({ cursor })}`),
  detail: (id, before) => portalApi(`/playground/conversations/${id}${queryString({ before })}`),
  create: id => portalApi('/playground/conversations', { method: 'POST', ...jsonBody({ id }) }),
  remove: id => portalApi(`/playground/conversations/${id}`, { method: 'DELETE' }),
  import: (id, messages) => portalApi('/playground/conversations/import', { method: 'POST', ...jsonBody({ id, messages }) }),
};
const PlaygroundContext = createContext<ConversationController | null>(null);

export function PlaygroundProvider({ userId, children }: PropsWithChildren<{ userId: string }>) {
  const client = useQueryClient();
  const [store] = useState(() => createConversationController({
    userId, storage: browserPlaygroundStorage(),
    api: historyApi,
    isEnabled: () => client.getQueryState(['session'])?.status === 'success' && client.getQueryData<SessionView>(['session'])?.playgroundEnabled === true,
    isOwner: () => { const session = client.getQueryData<SessionView>(['session']); return session?.authenticated === true && session.user?.id === userId; },
    stream: streamPlayground,
    settled: () => { void refreshPlaygroundBilling(client, userId); },
    unavailable: (kind, keyId) => { void client.invalidateQueries({ queryKey: kind === 'models' ? ['playground', 'models', userId, keyId] : ['playground', 'keys', userId] }); },
  }));
  useEffect(() => {
    const checkOwner = () => {
      const session = client.getQueryData<SessionView>(['session']);
      if (session && (!session.authenticated || session.user?.id !== userId)) store.clear();
    };
    const unsubscribe = client.getQueryCache().subscribe(event => { if (event.query.queryKey[0] === 'session') checkOwner(); });
    const hide = () => { if (document.visibilityState === 'hidden') store.flush(); };
    const leave = () => store.detach();
    const signingOut = () => store.stop();
    const focus = () => { if (location.pathname === '/playground') store.refresh(); };
    const poll = setInterval(() => { if (document.visibilityState === 'visible' && location.pathname === '/playground') store.refreshActive(); }, 5_000);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', leave);
    window.addEventListener('portal:signing-out', signingOut);
    window.addEventListener('focus', focus);
    checkOwner();
    return () => {
      unsubscribe(); document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', leave); window.removeEventListener('portal:signing-out', signingOut);
      window.removeEventListener('focus', focus); clearInterval(poll);
      store.detach();
    };
  }, [client, store, userId]);
  return <PlaygroundContext.Provider value={store}>{children}</PlaygroundContext.Provider>;
}

export function usePlayground() {
  const store = useContext(PlaygroundContext);
  if (!store) throw new Error('Playground requires an authenticated conversation.');
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { state, store };
}
