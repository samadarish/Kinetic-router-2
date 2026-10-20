import type { PlaygroundIntroduction } from '@kineticrouter/portal-contract';

type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
type Options = {
  userId: string;
  storage?: StoragePort;
  isOwner(): boolean;
  read(signal: AbortSignal): Promise<PlaygroundIntroduction>;
  save(signal: AbortSignal): Promise<PlaygroundIntroduction>;
};

export const playgroundIntroductionKey = (userId: string) => `kineticrouter-playground-introduction:${encodeURIComponent(userId)}`;
export function introductionStorage(): StoragePort | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

// Keep this single-flag read lightweight in the initial console bundle.
export function parsePlaygroundIntroduction(value: unknown): PlaygroundIntroduction {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== 1
    || !('visited' in value) || typeof value.visited !== 'boolean') throw new TypeError();
  return { visited: value.visited };
}

// Monotonic per-account state: late reads can never undo a completed visit.
export function createPlaygroundIntroduction(options: Options) {
  const key = playgroundIntroductionKey(options.userId);
  const marker = () => { try { return options.storage?.getItem(key); } catch { return null; } };
  const remember = (value: 'pending' | 'visited') => { try { options.storage?.setItem(key, value); } catch { /* Server persistence still works without browser storage. */ } };
  const initial = marker();
  let visited: boolean | null = initial === 'pending' || initial === 'visited' ? true : null;
  let pending = initial === 'pending';
  let active = false;
  let reading: AbortController | undefined, writing: AbortController | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  const listeners = new Set<() => void>();
  const owner = () => active && options.isOwner();
  const publish = (value: boolean | null) => {
    if (visited === true || visited === value) return;
    visited = value;
    for (const listener of listeners) listener();
  };
  const clearRetry = () => { clearTimeout(retry); retry = undefined; };
  const cancelRead = () => { reading?.abort(); reading = undefined; };

  async function save() {
    if (!owner() || !pending || writing) return;
    clearRetry();
    const request = new AbortController();
    writing = request;
    try {
      const result = await options.save(request.signal);
      if (!owner() || request.signal.aborted || writing !== request) return;
      if (result.visited !== true) throw new TypeError();
      pending = false; attempts = 0;
      remember('visited'); publish(true);
    } catch {
      // Retain a local pending visit so a later authenticated mount/focus can retry.
      if (owner() && pending && !request.signal.aborted && attempts < 2) {
        attempts++;
        retry = setTimeout(() => { retry = undefined; void save(); }, attempts * 5000);
      }
    } finally { if (writing === request) writing = undefined; }
  }

  async function refresh() {
    if (!owner()) return;
    const saved = marker();
    if (saved === 'pending' || saved === 'visited') {
      publish(true);
      pending = saved === 'pending';
    }
    if (pending) { void save(); return; }
    if (visited === true || reading) return;
    const request = new AbortController();
    reading = request;
    try {
      const result = await options.read(request.signal);
      if (!owner() || request.signal.aborted || reading !== request) return;
      if (result.visited) remember('visited');
      publish(result.visited);
    } catch {
      if (owner() && !request.signal.aborted && reading === request) publish(null);
    } finally { if (reading === request) reading = undefined; }
  }

  function visit() {
    if (!owner() || (visited === true && !pending)) return;
    cancelRead();
    pending = true; attempts = 0;
    remember('pending'); publish(true);
    void save();
  }
  function stop() {
    active = false; cancelRead();
    writing?.abort(); writing = undefined;
    clearRetry(); publish(null);
  }

  return {
    getSnapshot: () => visited,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    visit,
    stop,
    watch(target: Window) {
      active = true; attempts = 0;
      const focus = () => { attempts = 0; void refresh(); };
      const storage = (event: StorageEvent) => {
        if (!owner() || event.key !== key || (event.newValue !== 'pending' && event.newValue !== 'visited')) return;
        cancelRead(); publish(true);
        pending = event.newValue === 'pending';
        if (pending) void save(); else clearRetry();
      };
      target.addEventListener('focus', focus);
      target.addEventListener('online', focus);
      target.addEventListener('storage', storage);
      void refresh();
      return () => {
        target.removeEventListener('focus', focus);
        target.removeEventListener('online', focus);
        target.removeEventListener('storage', storage);
        stop();
      };
    },
  };
}
