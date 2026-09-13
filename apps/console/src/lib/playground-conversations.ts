import type { Conversation, ConversationDetail, ConversationPage, PlaygroundEvent, PlaygroundTurnInput } from '@kineticrouter/portal-contract';
import { PortalApiError } from './api';
import { createPlaygroundStore, type PlaygroundStore, type PlaygroundSnapshot } from './playground-store';
import { emptyPlayground, readPlayground, clearPlaygroundStorage, type PlaygroundStorage, type SavedPlayground } from './playground-storage';
import { CHAT_DRAFTS_KEY } from './playground-browser-storage';
export { CHAT_DRAFTS_KEY } from './playground-browser-storage';

type LocalDraft = { draft: string; selectedKey: string | null; selectedModel: string | null; localOnly: boolean };
export type HistoryApi = {
  list(cursor?: string): Promise<ConversationPage>;
  detail(id: string, before?: number): Promise<ConversationDetail>;
  create(id: string): Promise<Conversation>;
  remove(id: string): Promise<unknown>;
  import(id: string, messages: { role: 'user' | 'assistant'; content: string; model?: string }[]): Promise<Conversation>;
};
type Options = { userId: string; storage?: PlaygroundStorage; isOwner(): boolean; isEnabled?(): boolean; api: HistoryApi; stream(input: PlaygroundTurnInput, onEvent: (event: PlaygroundEvent) => void, signal: AbortSignal): Promise<void>; settled(): void; unavailable(kind: 'keys' | 'models', keyId: string): void };
export type HistorySnapshot = PlaygroundSnapshot & { historyReady: boolean; chatId: string; conversations: Conversation[]; listLoading: boolean; listError: string; nextCursor: string | null; loading: boolean; activeChatId: string | null; older: number | null; omittedTurns: number; legacy: SavedPlayground | null; legacyDismissed: boolean };
export function conversationMessages(detail: ConversationDetail): SavedPlayground['messages'] {
  return detail.turns.flatMap(turn => [
    { id: turn.sequence * 2, role: 'user' as const, content: turn.userText },
    { id: turn.sequence * 2 + 1, role: 'assistant' as const, content: turn.assistantText, model: turn.model ?? undefined, state: turn.state === 'receiving' ? undefined : turn.state, usage: turn.usage ?? undefined, limited: turn.limited },
  ]);
}
export function createConversationController(options: Options) {
  const locals = new Map<string, LocalDraft>();
  let selected = crypto.randomUUID() as string, dismissed = false;
  try {
    const raw = options.storage?.getItem(CHAT_DRAFTS_KEY);
    if (raw && raw.length < 2 * 1024 * 1024) {
      const data = JSON.parse(raw);
      if (data.userId === options.userId && typeof data.selected === 'string' && validId(data.selected) && Array.isArray(data.drafts)) {
        selected = data.selected; dismissed = data.dismissed === true;
        for (const item of data.drafts.slice(0, 100)) if (validId(item.id) && typeof item.draft === 'string' && item.draft.length <= 32_000 && (item.selectedKey === null || typeof item.selectedKey === 'string') && (item.selectedModel === null || typeof item.selectedModel === 'string')) locals.set(item.id, { draft: item.draft, selectedKey: item.selectedKey, selectedModel: item.selectedModel, localOnly: item.localOnly === true });
      }
    }
  } catch { /* A malformed local draft cannot replace server history. */ }
  const legacySaved = readPlayground(options.storage, options.userId);
  const legacy = legacySaved.saved.messages.length ? legacySaved.saved : null;
  const drivers = new Map<string, PlaygroundStore>();
  const summaries = new Map<string, Conversation>();
  const cursors = new Map<string, number | null>();
  const omitted = new Map<string, number>();
  const removed = new Set<string>();
  const ready = new Set<string>();
  const reads = new Map<string, number>();
  const invalidateRead = (id: string) => reads.set(id, (reads.get(id) ?? 0) + 1);
  const pendingDetails = new Map<string, { read: number; promise: Promise<ConversationDetail> }>();
  function requestDetail(id: string, previousRead: number, read: number) {
    const pending = pendingDetails.get(id);
    if (pending && pending.read === previousRead) {
      pending.read = read;
      return pending.promise;
    }
    const request = { read, promise: options.api.detail(id) };
    const finish = () => {
      if (pendingDetails.get(id) === request) pendingDetails.delete(id);
    };
    void request.promise.then(finish, finish);
    pendingDetails.set(id, request);
    return request.promise;
  }
  function remember(chat: Conversation) {
    const previous = summaries.get(chat.id);
    if (previous && previous.revision > chat.revision) return previous;
    const next = previous?.revision === chat.revision && !previous.active ? { ...chat, active: false } : chat;
    summaries.set(chat.id, next); return next;
  }
  const listeners = new Set<() => void>();
  let alive = true, activeId: string | null = null, requestGeneration = 0, listGeneration = 0;
  let listMutation = 0;
  let pendingList: { generation: number; mutation: number; cursor: string | undefined; promise: Promise<ConversationPage> } | undefined;
  function requestList(cursor: string | undefined, previousGeneration: number, generation: number) {
    if (pendingList && pendingList.cursor === cursor && pendingList.generation === previousGeneration && pendingList.mutation === listMutation) {
      pendingList.generation = generation;
      return pendingList.promise;
    }
    const request = { generation, mutation: listMutation, cursor, promise: options.api.list(cursor) };
    const finish = () => { if (pendingList === request) pendingList = undefined; };
    void request.promise.then(finish, finish);
    pendingList = request;
    return request.promise;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const importId = crypto.randomUUID();
  let state: HistorySnapshot = { ...emptyPlayground(), error: '', persistenceNotice: '', historyReady: true, chatId: selected, conversations: [], listLoading: false, listError: '', nextCursor: null, loading: false, activeChatId: null, older: null, omittedTurns: 0, legacy, legacyDismissed: dismissed };
  const owns = () => alive && options.isOwner();
  const canUse = () => owns() && (options.isEnabled?.() ?? true);
  function emit(patch: Partial<HistorySnapshot> = {}) { if (!owns()) return; state = { ...state, ...patch, historyReady: Boolean(locals.get(selected)?.localOnly || ready.has(selected)) }; listeners.forEach(listener => listener()); }
  function persist() {
    if (timer) clearTimeout(timer); timer = undefined;
    if (!owns()) return;
    try {
      const data = JSON.stringify({ userId: options.userId, selected, dismissed: state.legacyDismissed, drafts: [...locals].map(([id, local]) => ({ id, ...local })) });
      if (!options.storage || data.length > 2 * 1024 * 1024) throw new Error('Storage unavailable');
      options.storage.setItem(CHAT_DRAFTS_KEY, data);
    } catch { emit({ persistenceNotice: 'Sent messages are saved. This browser could not keep the unsent draft for a refresh.' }); }
  }
  function schedule() { if (!timer) timer = setTimeout(persist, 300); }
  function publish(id: string) {
    const driver = drivers.get(id); if (!driver || !owns() || removed.has(id)) return;
    const current = driver.getSnapshot(), local = locals.get(id);
    const updated = { draft: current.draft, selectedKey: current.selectedKey, selectedModel: current.selectedModel, localOnly: local?.localOnly ?? false };
    locals.set(id, updated);
    if (id === selected) emit({ ...current, persistenceNotice: state.persistenceNotice, chatId: selected, activeChatId: activeId, older: cursors.get(id) ?? null, omittedTurns: omitted.get(id) ?? 0 });
    if (!local || local.draft !== updated.draft || local.selectedKey !== updated.selectedKey || local.selectedModel !== updated.selectedModel) schedule();
  }
  function driverFor(id: string) {
    let driver = drivers.get(id); if (driver) return driver;
    const local = locals.get(id);
    driver = createPlaygroundStore({ userId: options.userId, remote: true, initial: { ...emptyPlayground(), ...local }, isOwner: () => owns() && !removed.has(id), unavailable: options.unavailable,
      stream: async (input, onEvent, signal) => {
        const requireEnabled = () => { if (!canUse()) throw new PortalApiError({ status: 403, code: 'PLAYGROUND_DISABLED', message: 'Playground is currently disabled.' }); };
        requireEnabled();
        activeId = id; invalidateRead(id); ready.delete(id); emit({ activeChatId: id });
        let submitted = false;
        const message = input.messages.at(-1)!.content;
        try {
          if (!summaries.has(id)) {
            const created = await options.api.create(id);
            if (!owns() || removed.has(id)) return;
            listMutation++;
            signal.throwIfAborted();
            summaries.set(id, created); locals.set(id, { ...locals.get(id)!, localOnly: false });
          }
          signal.throwIfAborted();
          requireEnabled();
          const turn: PlaygroundTurnInput = { conversationId: id, revision: summaries.get(id)!.revision, clientTurnId: crypto.randomUUID(), apiKeyId: input.apiKeyId, model: input.model, message };
          await options.stream(turn, event => {
            if (!owns() || removed.has(id)) return;
            if (event.type === 'turn_started') {
              listMutation++;
              submitted = true;
              const chat = summaries.get(id)!; summaries.set(id, { ...chat, revision: event.revision, turnCount: event.sequence, active: true });
              omitted.set(id, event.omittedTurns); if (selected === id) emit({ omittedTurns: event.omittedTurns });
              void refreshList();
            }
            onEvent(event);
          }, signal);
        } catch (error) {
          if (!submitted && owns() && !removed.has(id) && !drivers.get(id)?.getSnapshot().draft) drivers.get(id)?.setDraft(message);
          throw error;
        }
      },
      settled: () => {
        if (activeId === id) activeId = null;
        if (!owns()) return;
        listMutation++;
        emit({ activeChatId: activeId }); options.settled();
        if (!removed.has(id)) { invalidateRead(id); ready.delete(id); void load(id, false); } void refreshList();
      },
    });
    drivers.set(id, driver); driver.subscribe(() => publish(id));
    // Keep transcript memory bounded; local drafts survive eviction.
    for (const [key, candidate] of drivers) if (drivers.size > 8 && key !== id && key !== selected && key !== activeId) { candidate.detach(); drivers.delete(key); }
    return driver;
  }
  async function load(id: string, select: boolean, clearError = false) {
    if (!canUse()) return;
    const generation = select ? ++requestGeneration : requestGeneration;
    if (select) {
      selected = id;
      if (!locals.has(id)) locals.set(id, { draft: '', selectedKey: null, selectedModel: null, localOnly: false });
      emit({ ...driverFor(id).getSnapshot(), persistenceNotice: state.persistenceNotice, chatId: id, loading: !locals.get(id)?.localOnly, older: null, omittedTurns: 0 }); schedule();
    }
    if (locals.get(id)?.localOnly || activeId === id) { if (selected === id) emit({ loading: false }); return; }
    const previousRead = reads.get(id) ?? 0;
    const read = previousRead + 1; reads.set(id, read);
    try {
      const detail = await requestDetail(id, previousRead, read);
      if (!owns() || removed.has(id) || reads.get(id) !== read || (select && generation !== requestGeneration)) return;
      const remembered = remember(detail.conversation);
      if (remembered.revision !== detail.conversation.revision || remembered.active !== detail.conversation.active) { if (selected === id) emit({ loading: false }); return; }
      cursors.set(id, detail.nextBefore); ready.add(id);
      const driver = driverFor(id), current = driver.getSnapshot(), last = detail.turns.at(-1);
      const activity = detail.conversation.active ? 'Receiving' : last?.state === 'complete' ? 'Complete' : last?.state === 'failed' ? 'Failed' : last ? 'Stopped' : 'Ready';
      driver.hydrate({ ...current, selectedKey: current.selectedKey ?? detail.conversation.selectedKey, selectedModel: current.selectedModel ?? detail.conversation.selectedModel, messages: conversationMessages(detail), activity,
        timing: { firstText: last?.firstTextMs ?? undefined, elapsed: last?.durationMs ?? undefined, model: last?.model ?? undefined } }, clearError ? '' : current.error);
      if (selected === id) emit({ loading: false, older: detail.nextBefore, omittedTurns: omitted.get(id) ?? 0 });
    } catch (error) {
      if (!owns() || removed.has(id) || reads.get(id) !== read) return;
      ready.delete(id);
      const message = error instanceof Error ? error.message : 'Chat could not be loaded.';
      if (error instanceof PortalApiError && error.status === 404) {
        const driver = driverFor(id); driver.hydrate({ ...driver.getSnapshot(), messages: [], activity: 'Ready', timing: {} }, message);
        summaries.delete(id);
        emit({ conversations: state.conversations.filter(chat => chat.id !== id) });
      }
      if (selected === id && generation === requestGeneration) emit({ loading: false, error: message });
    }
  }
  async function refreshList(more = false) {
    if (!canUse()) return;
    if (!owns() || (more && (!state.nextCursor || state.listLoading))) return;
    const previousGeneration = listGeneration;
    const generation = ++listGeneration, cursor = more ? state.nextCursor! : undefined;
    emit({ listLoading: true, listError: '' });
    try {
      const result = await requestList(cursor, previousGeneration, generation);
      if (!owns() || generation !== listGeneration) return;
      for (const chat of result.items) if (!removed.has(chat.id)) remember(chat);
      const seen = new Set<string>();
      const items = [...(more ? state.conversations : []), ...result.items.map(chat => summaries.get(chat.id) ?? chat)].filter(chat => {
        if (removed.has(chat.id) || seen.has(chat.id)) return false;
        seen.add(chat.id); return true;
      });
      emit({ conversations: items, listLoading: false, nextCursor: result.nextCursor });
    } catch (error) { if (generation === listGeneration) emit({ listLoading: false, listError: error instanceof Error ? error.message : 'History could not be loaded.' }); }
  }
  if (!locals.has(selected)) locals.set(selected, { draft: '', selectedKey: null, selectedModel: null, localOnly: true });
  driverFor(selected); publish(selected);
  return {
    getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    open: (id: string) => { if (!owns() || !validId(id) || removed.has(id)) return; if (id === selected && (state.loading || summaries.has(id) || locals.get(id)?.localOnly)) return; return load(id, true); },
    refresh: () => { void refreshList(); if (activeId !== selected) void load(selected, false, true); }, refreshList,
    refreshActive: () => { if (state.activity === 'Receiving' && activeId !== selected) void load(selected, false); },
    newChat: () => { if (!canUse()) return null; const current = driverFor(selected).getSnapshot(); selected = crypto.randomUUID(); locals.set(selected, { draft: '', selectedKey: current.selectedKey, selectedModel: current.selectedModel, localOnly: true }); requestGeneration++; publish(selected); driverFor(selected); publish(selected); emit({ loading: false }); persist(); return selected; },
    setDraft: (value: string) => driverFor(selected).setDraft(value), selectKey: (value: string) => driverFor(selected).selectKey(value), selectModel: (value: string) => driverFor(selected).selectModel(value),
    send: (modelReady: boolean) => { if (canUse() && !activeId && !state.loading && !summaries.get(selected)?.active && (locals.get(selected)?.localOnly || ready.has(selected))) return driverFor(selected).send(modelReady); },
    stop: () => { if (activeId) drivers.get(activeId)?.stop(); },
    loadOlder: async () => { if (!canUse()) return; const id = selected, before = cursors.get(id); if (!before) return; try { const result = await options.api.detail(id, before); if (!owns() || removed.has(id)) return; cursors.set(id, result.nextBefore); driverFor(id).prepend(conversationMessages(result)); if (selected === id) emit({ older: result.nextBefore }); } catch (error) { if (selected === id) emit({ error: error instanceof Error ? error.message : 'Could not load earlier messages.' }); } },
    remove: async (id: string) => { if (!canUse()) return false; await options.api.remove(id); if (!owns()) return false; listMutation++; removed.add(id); invalidateRead(id); ready.delete(id); drivers.get(id)?.detach(); drivers.delete(id); locals.delete(id); summaries.delete(id); if (activeId === id) activeId = null; if (selected === id) requestGeneration++; emit({ conversations: state.conversations.filter(chat => chat.id !== id), activeChatId: activeId }); persist(); return true; },
    importLegacy: async () => {
      if (!canUse() || !state.legacy) return null;
      const id = importId;
      const chat = await options.api.import(id, state.legacy.messages.map(message => ({ role: message.role, content: message.content, ...(message.model ? { model: message.model } : {}) })));
      if (!owns()) return null;
      listMutation++;
      summaries.set(id, chat); clearPlaygroundStorage(options.storage); emit({ legacy: null, legacyDismissed: true }); persist(); await refreshList(); await load(id, true); return id;
    },
    dismissLegacy: () => { emit({ legacyDismissed: true }); persist(); },
    showLegacy: () => emit({ legacyDismissed: false }),
    flush: persist,
    detach: () => { for (const driver of drivers.values()) driver.detach(); persist(); },
    clear: () => { if (!alive) return; alive = false; requestGeneration++; listGeneration++; pendingDetails.clear(); pendingList = undefined; if (timer) clearTimeout(timer); for (const driver of drivers.values()) driver.clear(); drivers.clear(); locals.clear(); clearPlaygroundStorage(options.storage); try { options.storage?.removeItem(CHAT_DRAFTS_KEY); } catch {} state = { ...state, ...emptyPlayground(), conversations: [], legacy: null, error: '', activeChatId: null }; listeners.forEach(listener => listener()); },
  };
}
function validId(id: unknown): id is string { return typeof id === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id); }
export type ConversationController = ReturnType<typeof createConversationController>;
