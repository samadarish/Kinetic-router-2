import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConversationDetail, PlaygroundEvent, PlaygroundTurnInput } from '@kineticrouter/portal-contract';
import { MemoryConversationStore, type TurnUpdate } from '../apps/bff/src/conversations';
import { createConversationController, CHAT_DRAFTS_KEY, type ConversationController, type HistoryApi } from '../apps/console/src/lib/playground-conversations';
import { PortalApiError } from '../apps/console/src/lib/api';
import { emptyPlayground, writePlayground } from '../apps/console/src/lib/playground-storage';

const cleanup: ConversationController[] = [];
afterEach(() => { cleanup.splice(0).forEach(store => store.detach()); });
const usage = { inputTokens: 7, outputTokens: 13, totalTokens: 20 };
const terminal: TurnUpdate = { assistantText: 'Saved answer', state: 'complete', usage, firstTextMs: 10, durationMs: 50, limited: false };
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }
async function fixture() {
  const db = new MemoryConversationStore(), owner = { id: '42', label: 'Customer' }, values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  let owns = true, enabled = true;
  const api: HistoryApi = {
    list: vi.fn(cursor => db.list(owner.id, { cursor })), detail: vi.fn((id, before) => db.detail(owner.id, id, before)),
    create: vi.fn(id => db.create(owner, id)), remove: vi.fn(id => db.remove(owner.id, id)),
    import: vi.fn((id, messages) => db.create(owner, id, { id, messages })),
  };
  const streams: { input: PlaygroundTurnInput; chunk(text: string): void; finish(): Promise<void>; signal: AbortSignal }[] = [];
  const stream = vi.fn(async (input: PlaygroundTurnInput, onEvent: (event: PlaygroundEvent) => void, signal: AbortSignal) => {
    const begun = await db.begin(owner.id, input), completed = deferred<void>();
    onEvent({ type: 'turn_started', conversationId: input.conversationId, turnId: begun.turn.id, revision: begun.chat.revision, sequence: begun.turn.sequence, includedTurns: begun.history.length, omittedTurns: 0 });
    let text = '';
    signal.addEventListener('abort', () => { void db.write(begun.turn, { ...terminal, assistantText: text, state: 'stopped' }).then(() => completed.resolve()); }, { once: true });
    streams.push({ input, signal, chunk(delta) { text += delta; onEvent({ type: 'text_delta', text: delta }); }, async finish() { await db.write(begun.turn, { ...terminal, assistantText: text }); onEvent({ type: 'usage', usage }); onEvent({ type: 'done' }); completed.resolve(); } });
    await completed.promise;
  });
  function controller() { const value = createConversationController({ userId: owner.id, storage, isOwner: () => owns, isEnabled: () => enabled, api, stream, settled: vi.fn(), unavailable: vi.fn() }); cleanup.push(value); return value; }
  const store = controller();
  async function seed(text: string, key = '9') {
    const id = randomUUID(); await db.create(owner, id); const turn = await db.begin(owner.id, { conversationId: id, revision: 0, clientTurnId: randomUUID(), apiKeyId: key, model: 'saved-model', message: text }); await db.write(turn.turn, terminal); return id;
  }
  function prepare(message: string) { store.selectKey('7'); store.selectModel('test-model'); store.setDraft(message); }
  return { db, owner, storage, values, api, streams, stream, store, controller, seed, prepare, setEnabled: (value: boolean) => { enabled = value; }, loseOwner: () => { owns = false; } };
}

describe('account-backed conversation controller', () => {
  it('finishes an admitted reply while disabled and resumes history only after re-enabling', async () => {
    const fx = await fixture(); fx.prepare('Keep this reply');
    const id = fx.store.getSnapshot().chatId, sending = fx.store.send(true);
    await vi.waitFor(() => expect(fx.streams).toHaveLength(1));
    fx.setEnabled(false);
    Object.values(fx.api).forEach(mock => vi.mocked(mock).mockClear());
    fx.store.refresh(); await fx.store.open(id); await fx.store.loadOlder();
    expect(fx.store.newChat()).toBeNull();
    expect(await fx.store.remove(id)).toBe(false);
    await fx.store.send(true);
    fx.streams[0]!.chunk('Retained reply'); await fx.streams[0]!.finish(); await sending;
    expect(fx.streams[0]!.signal.aborted).toBe(false);
    expect(fx.store.getSnapshot().messages.at(-1)).toMatchObject({ content: 'Retained reply', state: 'complete', usage });
    for (const mock of Object.values(fx.api)) expect(mock).not.toHaveBeenCalled();
    expect(fx.stream).toHaveBeenCalledTimes(1);
    fx.setEnabled(true); fx.store.refresh();
    await vi.waitFor(() => expect(fx.api.detail).toHaveBeenCalled());
    expect(fx.store.getSnapshot().messages.at(-1)?.content).toBe('Retained reply');
  });

  it('does not start inference if the switch turns off while creating a chat', async () => {
    const fx = await fixture(), created = deferred<Awaited<ReturnType<HistoryApi['create']>>>();
    vi.mocked(fx.api.create).mockImplementationOnce(() => created.promise);
    fx.prepare('Preserve draft'); const id = fx.store.getSnapshot().chatId, sending = fx.store.send(true);
    fx.setEnabled(false); created.resolve(await fx.db.create(fx.owner, id)); await sending;
    expect(fx.stream).not.toHaveBeenCalled();
    expect(fx.store.getSnapshot().draft).toBe('Preserve draft');
  });

  it('preserves a failed request until an explicit successful reload, without retrying it', async () => {
    const fx = await fixture(); fx.prepare('Rejected request');
    fx.stream.mockImplementationOnce(async input => {
      const started = await fx.db.begin(fx.owner.id, input);
      await fx.db.write(started.turn, { ...terminal, assistantText: '', usage: null, state: 'failed' });
      throw new PortalApiError({ status: 502, code: 'PLAYGROUND_REQUEST_FAILED', message: 'The model service could not complete this request.' });
    });
    await fx.store.send(true);
    await vi.waitFor(() => expect(fx.store.getSnapshot().historyReady).toBe(true));
    expect(fx.store.getSnapshot()).toMatchObject({ error: 'The model service could not complete this request.', draft: 'Rejected request', activity: 'Failed' });
    fx.store.refresh();
    await vi.waitFor(() => expect(fx.store.getSnapshot().error).toBe(''));
    expect(fx.store.getSnapshot().messages.at(-1)).toMatchObject({ state: 'failed', content: '' });
    expect(fx.store.getSnapshot().draft).toBe('Rejected request');
    expect(fx.stream).toHaveBeenCalledTimes(1);
  });

  it('keeps a stream bound to its chat while switching and blocks a second send', async () => {
    const fx = await fixture(); fx.prepare('First chat'); const firstId = fx.store.getSnapshot().chatId;
    const sending = fx.store.send(true); await vi.waitFor(() => expect(fx.streams).toHaveLength(1));
    const secondId = fx.store.newChat()!; fx.store.setDraft('Next chat draft');
    fx.streams[0]!.chunk('First reply'); await fx.store.send(true); expect(fx.streams).toHaveLength(1);
    expect(fx.store.getSnapshot()).toMatchObject({ chatId: secondId, draft: 'Next chat draft', messages: [], activeChatId: firstId });
    await fx.streams[0]!.finish(); await sending;
    await vi.waitFor(() => expect(fx.store.getSnapshot().activeChatId).toBeNull());
    await fx.store.open(firstId);
    expect(fx.store.getSnapshot().messages.at(-1)).toMatchObject({ content: 'First reply', usage, state: 'complete' });
    await fx.store.open(secondId); expect(fx.store.getSnapshot().draft).toBe('Next chat draft');
    expect(Object.keys(fx.stream.mock.calls[0]![0]).sort()).toEqual(['apiKeyId', 'clientTurnId', 'conversationId', 'message', 'model', 'revision']);
  });
  it('reloads server messages and selected key/model without storing transcripts in browser drafts', async () => {
    const fx = await fixture(); const id = await fx.seed('Saved question'); await fx.store.open(id); fx.store.setDraft('Unsent local draft'); fx.store.flush();
    const raw = fx.storage.getItem(CHAT_DRAFTS_KEY)!;
    expect(raw).toContain('Unsent local draft'); expect(raw).not.toContain('Saved question'); expect(raw).not.toContain('Saved answer');
    const restored = fx.controller(); restored.refresh();
    await vi.waitFor(() => expect(restored.getSnapshot().messages).toHaveLength(2));
    expect(restored.getSnapshot()).toMatchObject({ selectedKey: '9', selectedModel: 'saved-model', draft: 'Unsent local draft' });
    expect(fx.stream).not.toHaveBeenCalled();
  });
  it('ignores an old detail response after a send and preserves a newly typed draft on failure', async () => {
    const fx = await fixture(), id = await fx.seed('Old question'); await fx.store.open(id);
    const old = await fx.db.detail(fx.owner.id, id), pending = deferred<ConversationDetail>();
    vi.mocked(fx.api.detail).mockImplementationOnce(() => pending.promise);
    fx.store.refresh(); fx.prepare('New question'); const sending = fx.store.send(true);
    await vi.waitFor(() => expect(fx.streams).toHaveLength(1)); pending.resolve(old);
    fx.streams[0]!.chunk('New reply'); await fx.streams[0]!.finish(); await sending;
    await vi.waitFor(() => expect(fx.store.getSnapshot().messages).toHaveLength(4));
    expect(fx.store.getSnapshot().messages.at(-1)?.content).toBe('New reply');
    const blocked = deferred<void>(); fx.stream.mockImplementationOnce(() => blocked.promise);
    fx.store.setDraft('Failing request'); const failed = fx.store.send(true); await vi.waitFor(() => expect(fx.stream).toHaveBeenCalledTimes(2));
    fx.store.setDraft('Keep my next draft'); blocked.reject(new Error('Request rejected')); await failed;
    expect(fx.store.getSnapshot().draft).toBe('Keep my next draft');
  });
  it('keeps an unrelated selected load alive when another chat is removed', async () => {
    const fx = await fixture(), a = await fx.seed('Chat A'), b = await fx.seed('Chat B');
    const pending = deferred<ConversationDetail>(), detail = await fx.db.detail(fx.owner.id, a);
    vi.mocked(fx.api.detail).mockImplementationOnce(() => pending.promise);
    const opening = fx.store.open(a); await fx.store.remove(b); pending.resolve(detail); await opening;
    expect(fx.store.getSnapshot()).toMatchObject({ chatId: a, loading: false, historyReady: true });
    expect(fx.store.getSnapshot().messages[0]?.content).toBe('Chat A');
  });
  it('invalidates a missing chat so typing cannot resurrect its transcript or enable sending', async () => {
    const fx = await fixture(), id = await fx.seed('Deleted elsewhere'); await fx.store.open(id);
    vi.mocked(fx.api.detail).mockRejectedValue(new PortalApiError({ status: 404, code: 'CHAT_NOT_FOUND', message: 'Chat removed' }));
    fx.store.refresh(); await vi.waitFor(() => expect(fx.store.getSnapshot().historyReady).toBe(false));
    fx.store.setDraft('Local draft'); expect(fx.store.getSnapshot().messages).toEqual([]);
    await fx.store.send(true); expect(fx.stream).not.toHaveBeenCalled();
  });
  it('does not remove a failed deletion or navigate after ownership changes', async () => {
    const fx = await fixture(), id = await fx.seed('Keep this'); await fx.store.open(id);
    vi.mocked(fx.api.remove).mockRejectedValueOnce(new Error('Offline'));
    await expect(fx.store.remove(id)).rejects.toThrow('Offline'); expect(fx.store.getSnapshot().messages).toHaveLength(2);
    const pending = deferred<void>(); vi.mocked(fx.api.remove).mockImplementationOnce(() => pending.promise);
    const deletion = fx.store.remove(id); fx.loseOwner(); fx.store.clear(); pending.resolve();
    expect(await deletion).toBe(false); expect(fx.store.newChat()).toBeNull(); expect(fx.store.getSnapshot().messages).toEqual([]);
  });
  it('stops and saves partial text, then restores without automatically retrying', async () => {
    const fx = await fixture(); fx.prepare('Stop test'); const id = fx.store.getSnapshot().chatId, send = fx.store.send(true);
    await vi.waitFor(() => expect(fx.streams).toHaveLength(1)); fx.streams[0]!.chunk('Partial text'); fx.store.stop(); await send;
    expect(fx.streams[0]!.signal.aborted).toBe(true);
    const restored = fx.controller(); await restored.open(id);
    expect(restored.getSnapshot().messages.at(-1)).toMatchObject({ content: 'Partial text', state: 'stopped' }); expect(fx.stream).toHaveBeenCalledTimes(1);
  });
  it('restores a stopped pre-submission draft without sending anything to inference', async () => {
    const fx = await fixture(), created = deferred<Awaited<ReturnType<HistoryApi['create']>>>();
    vi.mocked(fx.api.create).mockImplementationOnce(() => created.promise);
    fx.prepare('Preserve me'); const id = fx.store.getSnapshot().chatId, send = fx.store.send(true);
    fx.store.stop(); created.resolve(await fx.db.create(fx.owner, id)); await send;
    expect(fx.store.getSnapshot().draft).toBe('Preserve me'); expect(fx.stream).not.toHaveBeenCalled();
  });
  it('imports a legacy tab only on request, without forwarding saved metrics', async () => {
    const fx = await fixture(); writePlayground(fx.storage, fx.owner.id, { ...emptyPlayground(), messages: [{ id: 1, role: 'user', content: 'Legacy question' }, { id: 2, role: 'assistant', content: 'Legacy reply', model: 'old-model', usage, state: 'complete' }] });
    const store = fx.controller(); expect(store.getSnapshot().legacy).not.toBeNull(); expect(fx.api.import).not.toHaveBeenCalled();
    store.dismissLegacy(); expect(store.getSnapshot().legacyDismissed).toBe(true);
    const id = await store.importLegacy(); const imported = await fx.db.detail(null, id!);
    expect(imported.conversation.imported).toBe(true); expect(imported.turns[0]!.usage).toBeNull(); expect(JSON.stringify(vi.mocked(fx.api.import).mock.calls)).not.toContain('inputTokens');
  });
});
