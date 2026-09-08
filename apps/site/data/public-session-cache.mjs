import { consolePageUrl } from './public-console-origin.mjs';

export const pendingPublicSession = Object.freeze({ loaded: false, session: null, playgroundEnabled: false });

export function playgroundDestination(consoleOrigin, session) {
  return session?.authenticated ? consolePageUrl(consoleOrigin, '/playground') : '/account/sign-in?next=%2Fplayground';
}

export function createPublicSessionCache(consoleOrigin, { fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  let snapshot = pendingPublicSession;
  let expiresAt = 0;
  let pending;
  let controller;
  let generation = 0;
  const listeners = new Set();
  const publish = value => { snapshot = value; for (const listener of listeners) listener(); };
  let watchers = 0, stopWatching;
  const cache = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    watch({ window, document }) {
      if (++watchers === 1) {
        const refresh = () => { if (document.visibilityState === 'visible') void cache.refresh(); };
        const timer = window.setInterval(refresh, 60_000);
        window.addEventListener('focus', refresh); window.addEventListener('pageshow', refresh);
        document.addEventListener('visibilitychange', refresh);
        stopWatching = () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('pageshow', refresh); document.removeEventListener('visibilitychange', refresh); };
        refresh();
      }
      let watching = true;
      return () => { if (watching) { watching = false; if (--watchers === 0) { stopWatching?.(); stopWatching = undefined; } } };
    },
    refresh() {
      if (pending) return pending;
      if (now() < expiresAt) return Promise.resolve();
      const version = generation;
      const requestController = new AbortController();
      controller = requestController;
      const timer = setTimeout(() => requestController.abort(), 3000);
      pending = (async () => {
        let session = null;
        let succeeded = false;
        let playgroundEnabled = false;
        try {
          const response = await fetchImpl(consolePageUrl(consoleOrigin, '/portal/v1/public-session'), { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' }, signal: requestController.signal });
          const payload = response.ok ? await response.json() : null;
          if (payload?.ok && typeof payload.data?.authenticated === 'boolean') {
            succeeded = true;
            playgroundEnabled = payload.data.playgroundEnabled === true;
            const user = payload.data.user;
            if (payload.data.authenticated && typeof user?.id === 'string' && typeof user.username === 'string') {
              session = { authenticated: true, playgroundEnabled, user: { id: user.id, username: user.username, ...(typeof user.avatarUrl === 'string' ? { avatarUrl: user.avatarUrl } : {}) } };
            }
          }
        } catch { /* Keep navigation usable through the login-return route. */ }
        finally {
          clearTimeout(timer);
          if (generation === version) {
            pending = undefined; controller = undefined;
            expiresAt = now() + (succeeded ? 30_000 : 5000);
            publish({ loaded: true, session, playgroundEnabled });
          }
        }
      })();
      return pending;
    },
    signedOut() {
      generation += 1; controller?.abort(); controller = undefined; pending = undefined;
      expiresAt = now() + 30_000;
      publish({ loaded: true, session: null, playgroundEnabled: snapshot.playgroundEnabled });
    },
  };
  return cache;
}
