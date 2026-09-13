import { createContext, useContext, useEffect, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import type { SessionView } from '@kineticrouter/portal-contract';
import { ErrorState, LoadingState } from '../components/Ui';
import type { ConversationController } from './playground-conversations';

const PlaygroundContext = createContext<{ store: ConversationController | null; error: unknown } | null>(null);

export function PlaygroundProvider({ userId, children }: PropsWithChildren<{ userId: string }>) {
  const client = useQueryClient();
  const { pathname } = useLocation();
  const [store, setStore] = useState<ConversationController | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (store || pathname !== '/playground') return;
    let current = true;
    setError(null);
    // Warm the view in parallel with its controller; keep the gate closed until ownership exists.
    void import('../pages/PlaygroundPage').catch(() => {});
    void import('./playground-runtime').then(({ createUserPlayground }) => {
      if (current) { setError(null); setStore(createUserPlayground(client, userId)); }
    }).catch(reason => { if (current) setError(reason); });
    return () => { current = false; };
  }, [client, pathname, store, userId]);
  // Once initialized, ownership stays above the routes so navigation keeps replies alive.
  useEffect(() => {
    if (!store) return;
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
  return <PlaygroundContext.Provider value={{ store, error }}>{children}</PlaygroundContext.Provider>;
}

export function PlaygroundGate({ children }: PropsWithChildren) {
  const value = useContext(PlaygroundContext);
  if (value?.error) return <ErrorState error={value.error} retry={() => window.location.reload()} />;
  if (!value?.store) return <div className="route-loading"><LoadingState label="Loading page" /></div>;
  return children;
}

export function usePlayground() {
  const store = useContext(PlaygroundContext)?.store;
  if (!store) throw new Error('Playground requires an authenticated conversation.');
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { state, store };
}
