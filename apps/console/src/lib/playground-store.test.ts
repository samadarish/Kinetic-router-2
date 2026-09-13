import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlaygroundChatInput, PlaygroundEvent } from '@kineticrouter/portal-contract';
import { createPlaygroundStore } from './playground-store';
import { emptyPlayground, PLAYGROUND_STORAGE_KEY, readPlayground, writePlayground, type PlaygroundStorage } from './playground-storage';

function fixture(storage?: PlaygroundStorage) {
  vi.useFakeTimers();
  const values = new Map<string, string>();
  storage ??= { getItem: key => values.get(key) ?? null, setItem: vi.fn((key, value) => { values.set(key, value); }), removeItem: vi.fn(key => { values.delete(key); }) };
  let owner = '7';
  let emit!: (event: PlaygroundEvent) => void;
  let finish!: () => void;
  let signal!: AbortSignal;
  const stream = vi.fn((_input: PlaygroundChatInput, onEvent: typeof emit, abort: AbortSignal) => {
    emit = onEvent; signal = abort;
    return new Promise<void>(resolve => { finish = resolve; });
  });
  const settled = vi.fn();
  const make = (userId = '7') => createPlaygroundStore({ userId, storage, isOwner: () => owner === userId, stream, settled, unavailable: vi.fn() });
  const store = make();
  store.selectKey('2'); store.selectModel('chat-model');
  return { store, storage, stream, settled, make, setOwner: (id: string) => { owner = id; }, emit: (event: PlaygroundEvent) => emit(event), finish: () => finish(), signal: () => signal };
}
afterEach(() => { vi.useRealTimers(); });

describe('tab conversation store', () => {
  it('does not read legacy storage or schedule persistence for authoritative remote state', () => {
    vi.useFakeTimers();
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
    const store = createPlaygroundStore({ remote: true, initial: emptyPlayground(), userId: '7', storage, isOwner: () => true, stream: vi.fn(), settled: vi.fn(), unavailable: vi.fn() });
    const changed = vi.fn(); store.subscribe(changed);
    store.selectKey('2'); store.selectModel('chat'); store.setDraft('Retain this draft');
    expect(storage.getItem).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0); expect(changed).toHaveBeenCalledTimes(3);
    store.flush(); expect(storage.setItem).not.toHaveBeenCalled(); expect(store.getSnapshot().draft).toBe('Retain this draft');
    store.detach();
  });
  it('prepends older messages preserving current objects, input order and duplicate incoming IDs', () => {
    const current = { id: 4, role: 'user' as const, content: 'Current' };
    const older = { id: 2, role: 'user' as const, content: 'Older' };
    const store = createPlaygroundStore({ remote: true, initial: { ...emptyPlayground(), messages: [current] }, userId: '7', isOwner: () => true, stream: vi.fn(), settled: vi.fn(), unavailable: vi.fn() });
    store.prepend([older, { ...current, content: 'Stale duplicate' }, older]);
    expect(store.getSnapshot().messages).toEqual([older, older, current]); expect(store.getSnapshot().messages.at(-1)).toBe(current);
    store.detach();
  });
  it('finishes one stream with no mounted page and restores exact text, draft, model, usage and timing', async () => {
    const f = fixture(); const notify = vi.fn();
    const unsubscribe = f.store.subscribe(notify);
    f.store.setDraft('A visible prompt');
    const request = f.store.send(true);
    f.emit({ type: 'text_delta', text: 'First ' });
    unsubscribe(); notify.mockClear(); // Navigating away only detaches the view.
    f.store.setDraft('Follow-up draft');
    f.emit({ type: 'text_delta', text: 'answer 🪶' });
    f.emit({ type: 'usage', usage: { inputTokens: 17, outputTokens: 9, totalTokens: 26 } });
    f.emit({ type: 'done', finishReason: 'stop' }); f.finish(); await request;
    expect(notify).not.toHaveBeenCalled();
    expect(f.signal().aborted).toBe(false);
    expect(f.stream).toHaveBeenCalledTimes(1); expect(f.settled).toHaveBeenCalledTimes(1);
    expect(f.stream.mock.calls[0]![0]).toEqual({ apiKeyId: '2', model: 'chat-model', messages: [{ role: 'user', content: 'A visible prompt' }] });
    const restored = f.make().getSnapshot();
    expect(restored.messages).toEqual(f.store.getSnapshot().messages);
    expect(restored.messages[1]).toMatchObject({ content: 'First answer 🪶', state: 'complete', usage: { inputTokens: 17, outputTokens: 9, totalTokens: 26 } });
    expect(restored).toMatchObject({ draft: 'Follow-up draft', selectedKey: '2', selectedModel: 'chat-model', activity: 'Complete', timing: { model: 'chat-model' } });
    expect(f.stream).toHaveBeenCalledTimes(1);
  });
  it('restores an interrupted snapshot as stopped without replaying a request', async () => {
    const f = fixture(); f.store.setDraft('Prompt');
    const request = f.store.send(true);
    f.emit({ type: 'text_delta', text: 'Partial' }); f.store.flush();
    const restored = f.make();
    expect(restored.getSnapshot()).toMatchObject({ activity: 'Stopped', messages: [{ content: 'Prompt' }, { content: 'Partial', state: 'stopped' }] });
    expect(f.stream).toHaveBeenCalledTimes(1);
    f.store.detach(); expect(f.signal().aborted).toBe(true); f.finish(); await request;
  });
  it('flushes pending Unicode text on Stop and ignores a queued done event', async () => {
    const f = fixture(); f.store.setDraft('Prompt'); const request = f.store.send(true);
    f.emit({ type: 'text_delta', text: 'a' }); f.emit({ type: 'text_delta', text: '🪶b' });
    f.store.stop(); expect(f.signal().aborted).toBe(true);
    f.emit({ type: 'done', finishReason: 'stop' }); f.finish(); await request;
    expect(f.store.getSnapshot().messages[1]).toMatchObject({ content: 'a🪶b', state: 'stopped' });
    expect(f.make().getSnapshot().activity).toBe('Stopped');
    expect(f.store.getSnapshot().timing.elapsed).toBeDefined();
  });
  it('New chat retains selectors but prevents late events or writes from reviving old text', async () => {
    const f = fixture(); f.store.setDraft('Old prompt'); const request = f.store.send(true);
    f.emit({ type: 'text_delta', text: 'Old answer' }); f.store.setDraft('Old draft');
    f.store.newChat(); f.emit({ type: 'text_delta', text: 'late' }); f.emit({ type: 'done', finishReason: 'stop' }); f.finish(); await request;
    await vi.advanceTimersByTimeAsync(300);
    expect(f.make().getSnapshot()).toMatchObject({ messages: [], draft: '', activity: 'Ready', selectedKey: '2', selectedModel: 'chat-model' });
    expect(f.settled).toHaveBeenCalledTimes(1);
  });
  it('clears on logout/account change and rejects callbacks even after the same user signs in again', async () => {
    const f = fixture(); f.store.setDraft('Account A'); const request = f.store.send(true);
    f.emit({ type: 'text_delta', text: 'Private' }); f.store.clear(); f.setOwner('8');
    const next = f.make('8'); next.setDraft('Account B'); next.flush();
    // Repeated old-owner cleanup must not delete the new owner's snapshot.
    f.store.clear(); f.setOwner('7'); f.emit({ type: 'text_delta', text: 'late' }); f.finish(); await request;
    await vi.advanceTimersByTimeAsync(300);
    expect(f.signal().aborted).toBe(true);
    expect(f.store.getSnapshot().messages).toEqual([]);
    expect(readPlayground(f.storage, '8').saved.draft).toBe('Account B');
  });
  it('does not change state or private query invalidations after its owner changes', async () => {
    const f = fixture(); f.store.setDraft('Prompt'); const request = f.store.send(true);
    f.setOwner('8'); f.emit({ type: 'text_delta', text: 'late' }); f.finish(); await request;
    expect(f.store.getSnapshot().messages[1]!.content).toBe(''); expect(f.settled).not.toHaveBeenCalled();
    f.store.clear();
  });
  it('throttles complete snapshots and keeps stable, immutable reads', async () => {
    const f = fixture(); const first = f.store.getSnapshot();
    expect(f.store.getSnapshot()).toBe(first);
    for (let i = 0; i < 30; i++) f.store.setDraft(`Draft ${i}`);
    expect(f.storage.setItem).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(f.storage.setItem).toHaveBeenCalledTimes(1);
    expect(first.draft).toBe(''); expect(f.make().getSnapshot().draft).toBe('Draft 29');
    f.store.setDraft('Final'); f.store.flush(); await vi.advanceTimersByTimeAsync(500);
    expect(f.storage.setItem).toHaveBeenCalledTimes(2);
  });
  it('supports StrictMode-style detach/reuse without deleting saved state or disabling sends', async () => {
    const f = fixture(); f.store.setDraft('Retained'); f.store.detach();
    expect(f.make().getSnapshot().draft).toBe('Retained');
    const request = f.store.send(true); f.emit({ type: 'text_delta', text: 'Still works' }); f.emit({ type: 'done', finishReason: 'stop' }); f.finish(); await request;
    expect(f.store.getSnapshot().activity).toBe('Complete');
  });
  it('recovers from temporary storage failure without losing the in-memory draft', () => {
    const values = new Map<string, string>(); let fail = true;
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { if (fail) throw new Error('Quota exceeded'); values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    const f = fixture(storage); f.store.setDraft('Exact draft'); f.store.flush();
    expect(f.store.getSnapshot().draft).toBe('Exact draft'); expect(f.store.getSnapshot().persistenceNotice).toContain('could not be saved');
    fail = false; f.store.flush();
    expect(f.store.getSnapshot().persistenceNotice).toBe(''); expect(f.make().getSnapshot().draft).toBe('Exact draft');
  });
});

describe('safe local snapshots', () => {
  it('ignores unknown properties and stores no injected credential/query fields', () => {
    const f = fixture();
    const chat = { ...emptyPlayground(), messages: [{ id: 1, role: 'assistant' as const, content: 'Final text', model: 'chat-model', state: 'complete' as const, access_token: 'secret', reasoning: 'hidden' }], apiKey: 'secret', csrfToken: 'secret' };
    expect(writePlayground(f.storage, '7', chat)).toBe(true);
    expect(f.storage.getItem(PLAYGROUND_STORAGE_KEY)).not.toMatch(/secret|reasoning|access_token|csrfToken/);
    expect(readPlayground(f.storage, '7').saved.messages).toEqual([{ id: 1, role: 'assistant', content: 'Final text', model: 'chat-model', state: 'complete' }]);
    expect(readPlayground(f.storage, '8').saved.messages).toEqual([]);
  });
  it.each(['not json', JSON.stringify({ version: 9, userId: '7' }), JSON.stringify({ version: 1, userId: '7', chat: { ...emptyPlayground(), messages: [{ id: 1, role: 'system', content: 'hidden' }] } })])('rejects malformed stored state without throwing', raw => {
    const f = fixture(); f.storage.setItem(PLAYGROUND_STORAGE_KEY, raw);
    const result = readPlayground(f.storage, '7');
    expect(result.discard).toBe(true); expect(result.saved.messages).toEqual([]); expect(result.notice).toContain('could not be restored');
  });
  it.each([
    { messages: [{ id: 1, role: ['user'], content: 'Prompt' }] },
    { messages: [{ id: 1, role: 'assistant', content: 'Answer', state: ['complete'] }] },
    { activity: ['Complete'] },
  ])('rejects array values masquerading as string enums', patch => {
    const f = fixture(); f.storage.setItem(PLAYGROUND_STORAGE_KEY, JSON.stringify({ version: 1, userId: '7', chat: { ...emptyPlayground(), ...patch } }));
    expect(readPlayground(f.storage, '7').discard).toBe(true);
  });
  it('keeps oversized assistant output intact in memory and never stores a truncated snapshot', async () => {
    const f = fixture(); f.store.setDraft('Prompt'); const request = f.store.send(true);
    const text = 'a'.repeat(2 * 1024 * 1024 + 1);
    f.emit({ type: 'text_delta', text }); f.emit({ type: 'done', finishReason: 'stop' }); f.finish(); await request;
    expect(f.store.getSnapshot().messages[1]!.content).toBe(text);
    expect(f.storage.getItem(PLAYGROUND_STORAGE_KEY)).toBeNull(); expect(f.store.getSnapshot().persistenceNotice).toContain('could not be saved');
  });
  it('treats unavailable storage as in-memory mode', () => {
    expect(readPlayground(undefined, '7').notice).toContain('could not be saved');
    expect(writePlayground(undefined, '7', emptyPlayground())).toBe(false);
  });
});
