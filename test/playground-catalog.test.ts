import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaygroundCatalog } from '../apps/bff/src/playground-catalog';
import type { PlaygroundGateway } from '@kineticrouter/sub2api-client';

const key = { id: '7', key: 'synthetic-test-key', groupId: '4' };
const signal = new AbortController().signal;
function deferredModels() {
  let resolve!: (rows: Array<{ id: string; name: string }>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Array<{ id: string; name: string }>>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}
describe('sanitized playground catalog cache', () => {
  it('coalesces concurrent discovery and starts its TTL after completion', async () => {
    let now = 0;
    const work = deferredModels();
    const models = vi.fn().mockImplementationOnce(() => work.promise).mockResolvedValue([{ id: 'fresh', name: 'fresh' }]);
    const catalog = new PlaygroundCatalog({ models } as unknown as PlaygroundGateway, () => now);
    const first = catalog.models('1', key, signal), second = catalog.models('1', key, signal);
    expect(models).toHaveBeenCalledTimes(1);
    now = 40_000; work.resolve([{ id: 'chat', name: 'Untrusted label' }]);
    expect(await Promise.all([first, second])).toEqual([[{ id: 'chat', name: 'chat' }], [{ id: 'chat', name: 'chat' }]]);
    now = 69_999; await catalog.models('1', key, signal); expect(models).toHaveBeenCalledTimes(1);
    now = 70_000; expect(await catalog.models('1', key, signal)).toEqual([{ id: 'fresh', name: 'fresh' }]);
    expect(models).toHaveBeenCalledTimes(2);
  });
  it('cancels one caller independently and aborts discovery only after the last caller leaves', async () => {
    const work = deferredModels();
    let upstreamSignal: AbortSignal | undefined;
    const models = vi.fn((_key: string, requestSignal?: AbortSignal) => { upstreamSignal = requestSignal; return work.promise; });
    const catalog = new PlaygroundCatalog({ models } as unknown as PlaygroundGateway);
    const a = new AbortController(), b = new AbortController();
    const first = catalog.models('1', key, a.signal), second = catalog.models('1', key, b.signal);
    const reasonA = new Error('First caller left'), reasonB = new Error('Last caller left');
    const rejectedA = expect(first).rejects.toBe(reasonA);
    a.abort(reasonA); await rejectedA; expect(upstreamSignal?.aborted).toBe(false);
    const rejectedB = expect(second).rejects.toBe(reasonB);
    b.abort(reasonB); await rejectedB; expect(upstreamSignal?.aborted).toBe(true);
    expect(upstreamSignal?.reason).toBe(reasonB);
    work.resolve([{ id: 'abandoned', name: 'abandoned' }]);
    models.mockResolvedValue([{ id: 'fresh', name: 'fresh' }]);
    expect(await catalog.models('1', key, signal)).toEqual([{ id: 'fresh', name: 'fresh' }]);
    expect(models).toHaveBeenCalledTimes(2);
  });
  it('allows the remaining subscriber to complete and populate the cache', async () => {
    const work = deferredModels();
    const models = vi.fn(() => work.promise), controller = new AbortController();
    const catalog = new PlaygroundCatalog({ models } as unknown as PlaygroundGateway);
    const first = catalog.models('1', key, controller.signal), second = catalog.models('1', key, signal);
    const rejected = expect(first).rejects.toHaveProperty('name', 'AbortError');
    controller.abort(); await rejected;
    work.resolve([{ id: 'chat', name: 'chat' }]); await second;
    expect(await catalog.models('1', key, signal)).toEqual([{ id: 'chat', name: 'chat' }]);
    expect(models).toHaveBeenCalledTimes(1);
  });
  it('does not let an abandoned discovery cache results or remove its replacement', async () => {
    const old = deferredModels(), replacement = deferredModels();
    const models = vi.fn().mockImplementationOnce(() => old.promise).mockImplementationOnce(() => replacement.promise);
    const catalog = new PlaygroundCatalog({ models } as unknown as PlaygroundGateway), controller = new AbortController();
    const first = catalog.models('1', key, controller.signal);
    const rejected = expect(first).rejects.toHaveProperty('name', 'AbortError');
    controller.abort(); await rejected;
    const second = catalog.models('1', key, signal);
    old.resolve([{ id: 'stale', name: 'stale' }]); await old.promise; await Promise.resolve();
    const third = catalog.models('1', key, signal); expect(models).toHaveBeenCalledTimes(2);
    replacement.resolve([{ id: 'fresh', name: 'fresh' }]);
    expect(await Promise.all([second, third])).toEqual([[{ id: 'fresh', name: 'fresh' }], [{ id: 'fresh', name: 'fresh' }]]);
  });
  it('releases failed shared discovery so callers can retry', async () => {
    const work = deferredModels();
    const models = vi.fn().mockImplementationOnce(() => work.promise).mockResolvedValue([{ id: 'chat', name: 'chat' }]);
    const catalog = new PlaygroundCatalog({ models } as unknown as PlaygroundGateway);
    const first = catalog.models('1', key, signal), second = catalog.models('1', key, signal), error = new Error('Unavailable');
    const rejected = Promise.all([expect(first).rejects.toBe(error), expect(second).rejects.toBe(error)]);
    work.reject(error); await rejected; await catalog.models('1', key, signal); expect(models).toHaveBeenCalledTimes(2);
  });
  it('bounds pending coordination without rejecting distinct callers when full', async () => {
    const work = Array.from({ length: 5 }, () => deferredModels()); let next = 0;
    const models = vi.fn(() => work[next++]!.promise);
    const catalog = new PlaygroundCatalog({ models } as unknown as PlaygroundGateway, () => 0, 2);
    const first = catalog.models('1', key, signal), second = catalog.models('2', key, signal), joined = catalog.models('1', key, signal);
    const overflow = catalog.models('3', key, signal), anotherOverflow = catalog.models('3', key, signal);
    expect(models).toHaveBeenCalledTimes(4);
    work[0]!.resolve([{ id: 'chat', name: 'chat' }]); await Promise.all([first, joined]);
    const replacement = catalog.models('4', key, signal), replacementJoin = catalog.models('4', key, signal);
    expect(models).toHaveBeenCalledTimes(5);
    work.slice(1).forEach(item => item.resolve([{ id: 'chat', name: 'chat' }]));
    await Promise.all([second, overflow, anotherOverflow, replacement, replacementJoin]);
  });
  it('isolates concurrent work across users, key IDs, groups and credential rotation', async () => {
    const identities = [['1', key], ['2', key], ['1', { ...key, id: '8' }], ['1', { ...key, groupId: '5' }], ['1', { ...key, key: 'rotated' }]] as const;
    const work = identities.map(() => deferredModels()); let next = 0;
    const models = vi.fn(() => work[next++]!.promise), catalog = new PlaygroundCatalog({ models } as unknown as PlaygroundGateway);
    const pairs = identities.map(([user, value]) => [catalog.models(user, value, signal), catalog.models(user, value, signal)]);
    expect(models).toHaveBeenCalledTimes(5);
    work.forEach((item, index) => item.resolve([{ id: `model-${index}`, name: 'Untrusted' }]));
    for (const [index, pair] of pairs.entries()) expect(await Promise.all(pair)).toEqual([[{ id: `model-${index}`, name: `model-${index}` }], [{ id: `model-${index}`, name: `model-${index}` }]]);
  });
  it('rejects already-aborted callers before discovery or a cache hit', async () => {
    const models = vi.fn(async () => [{ id: 'chat', name: 'chat' }]);
    const catalog = new PlaygroundCatalog({ models } as unknown as PlaygroundGateway), controller = new AbortController();
    controller.abort(); await expect(catalog.models('1', key, controller.signal)).rejects.toHaveProperty('name', 'AbortError');
    expect(models).not.toHaveBeenCalled(); await catalog.models('1', key, signal);
    await expect(catalog.models('1', key, controller.signal)).rejects.toHaveProperty('name', 'AbortError'); expect(models).toHaveBeenCalledTimes(1);
  });
  it('strips poisoned fields, copies upstream rows, expires and evicts within its bound', async () => {
    let now = 0;
    const rows = [{ id: 'chat', name: 'Upstream label', rate_multiplier: 7 }, { id: 'bad\u0000id', name: 'Bad' }];
    const models = vi.fn(async () => rows);
    const catalog = new PlaygroundCatalog({ models } as unknown as PlaygroundGateway, () => now, 2);
    expect(await catalog.models('1', key, signal)).toEqual([{ id: 'chat', name: 'chat' }]);
    rows[0]!.id = 'changed';
    expect(await catalog.models('1', key, signal)).toEqual([{ id: 'chat', name: 'chat' }]);
    expect(models).toHaveBeenCalledTimes(1);
    now = 30_001;
    expect(await catalog.models('1', key, signal)).toEqual([{ id: 'changed', name: 'changed' }]);
    await catalog.models('2', key, signal); await catalog.models('3', key, signal); await catalog.models('1', key, signal);
    expect(models).toHaveBeenCalledTimes(5);
  });
  it('isolates users, keys, groups and rotated credentials', async () => {
    const models = vi.fn(async () => [{ id: 'chat', name: 'chat' }]);
    const catalog = new PlaygroundCatalog({ models } as unknown as PlaygroundGateway);
    for (const [user, value] of [['1', key], ['2', key], ['1', { ...key, id: '8' }], ['1', { ...key, groupId: '5' }], ['1', { ...key, key: 'rotated' }]] as const) await catalog.models(user, value, signal);
    expect(models).toHaveBeenCalledTimes(5);
    await catalog.models('1', key, signal); expect(models).toHaveBeenCalledTimes(5);
  });
  it('does not cache failed discovery', async () => {
    const models = vi.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue([{ id: 'chat', name: 'chat' }]);
    const catalog = new PlaygroundCatalog({ models } as unknown as PlaygroundGateway);
    await expect(catalog.models('1', key, signal)).rejects.toThrow('Unavailable');
    await catalog.models('1', key, signal); expect(models).toHaveBeenCalledTimes(2);
  });
});

type CatalogInspection = {
  pending: Map<string, { subscribers?: Set<unknown> }>;
  discover(id: string, credential: string, signal: AbortSignal): Promise<Array<{ id: string; name: string }>>;
};
function inspectCatalog(catalog: PlaygroundCatalog) { return catalog as unknown as CatalogInspection; }
function observe<T>(promise: Promise<T>) {
  const outcome: { state: 'pending' | 'fulfilled' | 'rejected'; value?: T; reason?: unknown } = { state: 'pending' };
  void promise.then(
    value => { outcome.state = 'fulfilled'; outcome.value = value; },
    reason => { outcome.state = 'rejected'; outcome.reason = reason; },
  );
  return outcome;
}

describe('playground discovery resource lifetime', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('expires shared discovery after 120 seconds even when a new caller joins just before its deadline', async () => {
    const work = deferredModels();
    let upstreamSignal: AbortSignal | undefined;
    const models = vi.fn((_key: string, requestSignal?: AbortSignal) => { upstreamSignal = requestSignal; return work.promise; });
    const catalog = new PlaygroundCatalog({ models } as unknown as PlaygroundGateway);
    const first = observe(catalog.models('1', key, new AbortController().signal));
    await vi.advanceTimersByTimeAsync(119_999);
    const joined = observe(catalog.models('1', key, new AbortController().signal));
    expect(first.state).toBe('pending'); expect(joined.state).toBe('pending');
    expect(models).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(upstreamSignal?.aborted).toBe(true);
    expect(first).toMatchObject({ state: 'rejected', reason: { name: 'TimeoutError' } });
    expect(joined).toMatchObject({ state: 'rejected', reason: { name: 'TimeoutError' } });
    expect(inspectCatalog(catalog).pending.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes canceled subscribers without accumulating discovery completion handlers', async () => {
    const work = deferredModels();
    const models = vi.fn(() => work.promise);
    const catalog = new PlaygroundCatalog({ models } as unknown as PlaygroundGateway);
    const inspected = inspectCatalog(catalog), discover = inspected.discover.bind(catalog);
    let completionHandlerCount = () => 0;
    vi.spyOn(inspected, 'discover').mockImplementation((id, credential, requestSignal) => {
      const promise = discover(id, credential, requestSignal);
      const completion = vi.spyOn(promise, 'then');
      completionHandlerCount = () => completion.mock.calls.length;
      return promise;
    });
    const keeper = catalog.models('1', key, new AbortController().signal);
    observe(keeper);
    await vi.advanceTimersByTimeAsync(0);
    const initialHandlerCount = completionHandlerCount();
    expect(initialHandlerCount).toBeGreaterThan(0);
    for (let index = 0; index < 250; index++) {
      const controller = new AbortController(), reason = new Error('Caller left');
      const rejected = expect(catalog.models('1', key, controller.signal)).rejects.toBe(reason);
      controller.abort(reason);
      await rejected;
    }
    expect(models).toHaveBeenCalledTimes(1);
    // A waiter count alone hid the leak: callbacks on the shared promise also must stay constant.
    expect(completionHandlerCount()).toBe(initialHandlerCount);
    const operation = [...inspected.pending.values()][0]!;
    expect(operation.subscribers?.size).toBe(1);
    work.resolve([{ id: 'chat', name: 'chat' }]);
    await keeper;
    expect(operation.subscribers?.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a chat caller alive after a discovery caller reaches its independent 12-second deadline', async () => {
    const work = deferredModels();
    let upstreamSignal: AbortSignal | undefined;
    const models = vi.fn((_key: string, requestSignal?: AbortSignal) => { upstreamSignal = requestSignal; return work.promise; });
    const catalog = new PlaygroundCatalog({ models } as unknown as PlaygroundGateway);
    const controller = new AbortController(), reason = new DOMException('Caller deadline', 'TimeoutError');
    const discovery = observe(catalog.models('1', key, controller.signal));
    const chat = catalog.models('1', key, new AbortController().signal), chatOutcome = observe(chat);
    setTimeout(() => controller.abort(reason), 12_000);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(discovery).toMatchObject({ state: 'rejected', reason });
    expect(chatOutcome.state).toBe('pending');
    expect(upstreamSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(8_000);
    work.resolve([{ id: 'chat', name: 'chat' }]);
    expect(await chat).toEqual([{ id: 'chat', name: 'chat' }]);
    expect(await catalog.models('1', key, signal)).toEqual([{ id: 'chat', name: 'chat' }]);
    expect(models).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['success', 'failure'] as const)('releases a timed-out operation immediately and ignores its late %s', async late => {
    const old = deferredModels(), replacement = deferredModels();
    const models = vi.fn().mockImplementationOnce(() => old.promise).mockImplementationOnce(() => replacement.promise);
    const catalog = new PlaygroundCatalog({ models } as unknown as PlaygroundGateway);
    const original = observe(catalog.models('1', key, new AbortController().signal));
    // The mock deliberately ignores the upstream signal and remains unsettled at the deadline.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(original).toMatchObject({ state: 'rejected', reason: { name: 'TimeoutError' } });
    expect(inspectCatalog(catalog).pending.size).toBe(0);
    const second = catalog.models('1', key, new AbortController().signal); observe(second);
    expect(models).toHaveBeenCalledTimes(2);
    if (late === 'success') old.resolve([{ id: 'stale', name: 'stale' }]);
    else old.reject(new Error('Late gateway failure'));
    await vi.advanceTimersByTimeAsync(0);
    const third = catalog.models('1', key, new AbortController().signal); observe(third);
    expect(models).toHaveBeenCalledTimes(2);
    replacement.resolve([{ id: 'fresh', name: 'fresh' }]);
    expect(await Promise.all([second, third])).toEqual([[{ id: 'fresh', name: 'fresh' }], [{ id: 'fresh', name: 'fresh' }]]);
    expect(await catalog.models('1', key, signal)).toEqual([{ id: 'fresh', name: 'fresh' }]);
    expect(models).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['success', 'failure', 'cancellation', 'timeout'] as const)('removes timers and caller listeners after %s', async terminal => {
    const work = deferredModels(), a = new AbortController(), b = new AbortController();
    const addedA = vi.spyOn(a.signal, 'addEventListener'), removedA = vi.spyOn(a.signal, 'removeEventListener');
    const addedB = vi.spyOn(b.signal, 'addEventListener'), removedB = vi.spyOn(b.signal, 'removeEventListener');
    const catalog = new PlaygroundCatalog({ models: vi.fn(() => work.promise) } as unknown as PlaygroundGateway);
    const first = observe(catalog.models('1', key, a.signal)), second = observe(catalog.models('1', key, b.signal));
    const listenerA = addedA.mock.calls.find(([event]) => event === 'abort')?.[1];
    const listenerB = addedB.mock.calls.find(([event]) => event === 'abort')?.[1];
    expect(listenerA).toBeTypeOf('function'); expect(listenerB).toBeTypeOf('function');
    if (terminal === 'success') work.resolve([{ id: 'chat', name: 'chat' }]);
    else if (terminal === 'failure') work.reject(new Error('Gateway unavailable'));
    else if (terminal === 'cancellation') { a.abort(); b.abort(); }
    await vi.advanceTimersByTimeAsync(terminal === 'timeout' ? 120_000 : 0);
    expect(first.state).toBe(terminal === 'success' ? 'fulfilled' : 'rejected');
    expect(second.state).toBe(terminal === 'success' ? 'fulfilled' : 'rejected');
    expect(removedA).toHaveBeenCalledWith('abort', listenerA);
    expect(removedB).toHaveBeenCalledWith('abort', listenerB);
    expect(inspectCatalog(catalog).pending.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('registers the initial caller before a gateway can synchronously trigger its cancellation', async () => {
    const work = deferredModels(), controller = new AbortController(), reason = new Error('Canceled during gateway start');
    let canceledBeforeGatewayReturned = false;
    const models = vi.fn().mockImplementationOnce((_key: string, upstreamSignal?: AbortSignal) => {
      controller.abort(reason);
      canceledBeforeGatewayReturned = upstreamSignal?.aborted === true;
      return work.promise;
    }).mockResolvedValue([{ id: 'fresh', name: 'fresh' }]);
    const catalog = new PlaygroundCatalog({ models } as unknown as PlaygroundGateway);
    const first = observe(catalog.models('1', key, controller.signal));
    await vi.advanceTimersByTimeAsync(0);
    expect(canceledBeforeGatewayReturned).toBe(true);
    expect(first).toMatchObject({ state: 'rejected', reason });
    expect(inspectCatalog(catalog).pending.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    work.resolve([{ id: 'stale', name: 'stale' }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(await catalog.models('1', key, signal)).toEqual([{ id: 'fresh', name: 'fresh' }]);
    expect(models).toHaveBeenCalledTimes(2);
  });
});
