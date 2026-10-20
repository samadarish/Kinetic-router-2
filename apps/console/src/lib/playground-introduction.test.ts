// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlaygroundIntroduction, parsePlaygroundIntroduction, playgroundIntroductionKey } from './playground-introduction';

const cleanup: Array<() => void> = [];
let saved: Map<string, string>;
beforeEach(() => { saved = new Map(); });
afterEach(() => { for (const stop of cleanup.splice(0)) stop(); vi.useRealTimers(); });
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
function fixture(overrides: Partial<Parameters<typeof createPlaygroundIntroduction>[0]> = {}) {
  const read = vi.fn(async () => ({ visited: false })), save = vi.fn(async () => ({ visited: true }));
  const options = { userId: '42', storage: { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); } }, isOwner: () => true, read, save, ...overrides };
  const store = createPlaygroundIntroduction(options);
  const stop = store.watch(window); cleanup.push(stop);
  return { store, read, save, stop };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

describe('Playground first-visit state', () => {
  it.each([null, {}, { visited: 'false' }, { visited: 0 }, { visited: true, unexpected: 'value' }])('rejects malformed or oversized status payloads %j', value => {
    expect(() => parsePlaygroundIntroduction(value)).toThrow(TypeError);
  });
  it('waits for a known unvisited status and remembers completion through later mounts', async () => {
    const { store, read, save, stop } = fixture();
    expect(store.getSnapshot()).toBeNull();
    await settle(); expect(store.getSnapshot()).toBe(false);
    store.visit(); expect(store.getSnapshot()).toBe(true);
    expect(saved.get(playgroundIntroductionKey('42'))).toBe('pending');
    await settle(); expect(saved.get(playgroundIntroductionKey('42'))).toBe('visited');
    store.visit(); expect(save).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
    stop();
    const returned = fixture(); await settle();
    expect(returned.store.getSnapshot()).toBe(true);
    expect(returned.read).not.toHaveBeenCalled();
    expect(returned.save).not.toHaveBeenCalled();
  });
  it('respects the account flag in a fresh browser without local history', async () => {
    const read = vi.fn(async () => ({ visited: true }));
    const { store, save } = fixture({ read }); await settle();
    expect(store.getSnapshot()).toBe(true);
    expect(saved.get(playgroundIntroductionKey('42'))).toBe('visited');
    store.visit(); expect(save).not.toHaveBeenCalled();
  });
  it('aborts an older status read so it cannot restore the highlight after a visit', async () => {
    const old = deferred<{ visited: boolean }>(); let signal!: AbortSignal;
    const { store } = fixture({ read: value => { signal = value; return old.promise; } });
    store.visit(); expect(signal.aborted).toBe(true);
    old.resolve({ visited: false }); await settle();
    expect(store.getSnapshot()).toBe(true);
    expect(saved.get(playgroundIntroductionKey('42'))).toBe('visited');
  });
  it('hides unknown/failed reads and retries on foreground focus', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue({ visited: false });
    const { store } = fixture({ read }); await settle();
    expect(store.getSnapshot()).toBeNull();
    window.dispatchEvent(new Event('focus')); await settle();
    expect(store.getSnapshot()).toBe(false);
  });
  it('retains failed saves, bounds automatic retries, and syncs on a later authenticated mount', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockRejectedValue(new Error('Unavailable'));
    const { store, stop } = fixture({ save }); await settle();
    store.visit(); await settle();
    expect(store.getSnapshot()).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(save).toHaveBeenCalledTimes(3);
    expect(saved.get(playgroundIntroductionKey('42'))).toBe('pending');
    stop();
    const returned = fixture(); await settle();
    expect(returned.save).toHaveBeenCalledTimes(1);
    expect(returned.store.getSnapshot()).toBe(true);
    expect(saved.get(playgroundIntroductionKey('42'))).toBe('visited');
  });
  it('keeps the visit hidden when browser storage is unavailable', async () => {
    const { store, save } = fixture({ storage: { getItem: () => { throw new Error(); }, setItem: () => { throw new Error(); } } });
    await settle(); store.visit(); await settle();
    expect(store.getSnapshot()).toBe(true); expect(save).toHaveBeenCalledTimes(1);
  });
  it('does not read or write for a disabled or logged-out owner', async () => {
    const { store, read, save } = fixture({ isOwner: () => false });
    store.visit(); window.dispatchEvent(new Event('focus')); await settle();
    expect(read).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBeNull(); expect(saved.size).toBe(0);
  });
  it('cancels writes on owner changes and ignores late results for the previous account', async () => {
    let owner = true, signal!: AbortSignal;
    const old = deferred<{ visited: boolean }>();
    const first = fixture({ isOwner: () => owner, save: value => { signal = value; return old.promise; } });
    await settle(); first.store.visit();
    owner = false; first.stop(); expect(signal.aborted).toBe(true);
    const second = fixture({ userId: '43' }); await settle();
    old.resolve({ visited: true }); await settle();
    expect(saved.get(playgroundIntroductionKey('42'))).toBe('pending');
    expect(saved.has(playgroundIntroductionKey('43'))).toBe(false);
    expect(second.store.getSnapshot()).toBe(false);
  });
  it('dismisses other tabs for the same account and ignores unrelated storage events', async () => {
    const { store, save } = fixture(); await settle();
    window.dispatchEvent(new StorageEvent('storage', { key: playgroundIntroductionKey('43'), newValue: 'visited' }));
    expect(store.getSnapshot()).toBe(false);
    window.dispatchEvent(new StorageEvent('storage', { key: playgroundIntroductionKey('42'), newValue: 'pending' }));
    expect(store.getSnapshot()).toBe(true);
    await settle(); expect(save).toHaveBeenCalledTimes(1);
    expect(saved.get(playgroundIntroductionKey('42'))).toBe('visited');
  });
});
