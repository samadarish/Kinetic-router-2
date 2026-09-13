import type { PlaygroundChatInput, PlaygroundEvent } from '@kineticrouter/portal-contract';
import { PortalApiError } from './api';
import { createPlaygroundBuffer } from './playground-buffer';
import { appendPlaygroundTurn, playgroundHistory } from './playground-state';
import { clearPlaygroundStorage, emptyPlayground, persistenceNotice, readPlayground, writePlayground, type PlaygroundStorage, type SavedPlayground } from './playground-storage';

type Options = {
  initial?: SavedPlayground; remote?: boolean;
  userId: string; storage?: PlaygroundStorage; isOwner(): boolean;
  stream(input: PlaygroundChatInput, onEvent: (event: PlaygroundEvent) => void, signal: AbortSignal): Promise<void>;
  settled(): void;
  unavailable(kind: 'keys' | 'models', keyId: string): void;
};
export type PlaygroundSnapshot = SavedPlayground & { error: string; persistenceNotice: string };

/** Owns one tab's conversation independently of any route or mounted view. */
export function createPlaygroundStore(options: Options) {
  const restored = options.remote && options.initial
    ? { saved: options.initial, notice: '', discard: false }
    : readPlayground(options.storage, options.userId);
  let snapshot: PlaygroundSnapshot = { ...(options.initial ?? restored.saved), error: '', persistenceNotice: options.remote ? '' : restored.notice };
  let discard = restored.discard;
  let nextId = Math.max(0, ...snapshot.messages.map(message => message.id)) + 1;
  const listeners = new Set<() => void>();
  let pendingSave: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let buffer: ReturnType<typeof createPlaygroundBuffer> | undefined;
  let generation = 0;
  let cleared = false;
  let startedAt: number | undefined;

  const notify = () => listeners.forEach(listener => listener());
  function flush() {
    if (pendingSave !== undefined) clearTimeout(pendingSave);
    pendingSave = undefined;
    if (cleared || !options.isOwner() || options.remote) return;
    if (discard) { clearPlaygroundStorage(options.storage); discard = false; }
    const saved = writePlayground(options.storage, options.userId, snapshot);
    if (!saved && snapshot.persistenceNotice !== persistenceNotice) { snapshot = { ...snapshot, persistenceNotice }; notify(); }
    if (saved && snapshot.persistenceNotice === persistenceNotice) { snapshot = { ...snapshot, persistenceNotice: '' }; notify(); }
  }
  function update(patch: Partial<PlaygroundSnapshot>, immediate = false) {
    if (cleared || !options.isOwner()) return;
    snapshot = { ...snapshot, ...patch }; notify();
    if (immediate) flush();
    else if (!options.remote && pendingSave === undefined) pendingSave = setTimeout(flush, 250);
  }
  function stop() {
    buffer?.flush();
    if (!controller) return;
    controller.abort();
    // Invalidate immediately: a queued terminal event must not turn Stop into Complete.
    generation++;
    controller = undefined; buffer?.dispose(); buffer = undefined;
    update({ messages: snapshot.messages.map(message => message.role === 'assistant' && !message.state ? { ...message, state: 'stopped' } : message), activity: 'Stopped', timing: { ...snapshot.timing, model: snapshot.selectedModel ?? undefined, elapsed: startedAt === undefined ? undefined : performance.now() - startedAt } }, true);
  }
  function clear() {
    if (cleared) return;
    generation++; controller?.abort(); controller = undefined; buffer?.dispose(); buffer = undefined;
    if (pendingSave !== undefined) clearTimeout(pendingSave);
    pendingSave = undefined; cleared = true;
    clearPlaygroundStorage(options.storage);
    snapshot = { ...emptyPlayground(), error: '', persistenceNotice: '' }; notify();
  }
  function newChat() {
    if (cleared || !options.isOwner()) return;
    generation++; controller?.abort(); controller = undefined; buffer?.dispose(); buffer = undefined;
    if (pendingSave !== undefined) clearTimeout(pendingSave);
    pendingSave = undefined; nextId = 1;
    clearPlaygroundStorage(options.storage);
    update({ ...emptyPlayground(), selectedKey: snapshot.selectedKey, selectedModel: snapshot.selectedModel, error: '', persistenceNotice: '' }, true);
  }
  async function send(modelReady: boolean) {
    if (controller || cleared || !options.isOwner() || !modelReady || !snapshot.selectedKey || !snapshot.selectedModel || !snapshot.draft.trim()) return;
    const keyId = snapshot.selectedKey;
    const modelId = snapshot.selectedModel;
    const history = options.remote ? [{ role: 'user' as const, content: snapshot.draft }] : playgroundHistory(snapshot.messages, snapshot.draft);
    if (history.length > 40) { update({ error: 'Start a new chat to continue. Each conversation supports 40 messages.' }); return; }
    const input = { apiKeyId: keyId, model: modelId, messages: history };
    if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 128 * 1024) { update({ error: 'This conversation is too large to send. Start a new chat or shorten the message.' }); return; }
    const request = new AbortController();
    const current = ++generation;
    controller = request;
    const responseId = nextId + 1;
    const messages = appendPlaygroundTurn(snapshot.messages, snapshot.draft, modelId, nextId); nextId += 2;
    update({ messages, draft: '', error: '', activity: 'Sending', timing: {} }, true);
    let completed = false;
    let failed = false;
    let firstText: number | undefined;
    const started = performance.now();
    startedAt = started;
    const ownsRequest = () => !cleared && options.isOwner() && generation === current && controller === request;
    const changeResponse = (patch: Partial<PlaygroundSnapshot['messages'][number]>) => update({ messages: snapshot.messages.map(message => message.id === responseId ? { ...message, ...patch } : message) });
    const pending = createPlaygroundBuffer(text => {
      if (ownsRequest()) update({ messages: snapshot.messages.map(message => message.id === responseId ? { ...message, content: message.content + text } : message) });
    });
    buffer = pending;
    try {
      await options.stream(input, event => {
        if (!ownsRequest() || request.signal.aborted) return;
        if (event.type === 'text_delta') {
          if (firstText === undefined && event.text) { firstText = performance.now() - started; update({ timing: { firstText, model: modelId }, activity: 'Receiving' }); }
          pending.push(event.text);
        }
        if (event.type === 'usage') changeResponse({ usage: event.usage });
        if (event.type === 'done') { pending.flush(); completed = true; changeResponse({ state: 'complete', limited: event.finishReason === 'length' }); }
        if (event.type === 'error') { pending.flush(); failed = true; update({ error: event.message }); }
      }, request.signal);
    } catch (reason) {
      if (ownsRequest() && !request.signal.aborted) {
        failed = true; update({ error: reason instanceof Error ? reason.message : 'The request could not be completed. Check Usage for any billed cost.' });
        if (reason instanceof PortalApiError) {
          if (reason.code === 'MODEL_UNAVAILABLE') options.unavailable('models', keyId);
          if (['KEY_UNAVAILABLE', 'KEY_NOT_FOUND', 'PLAYGROUND_KEY_REJECTED'].includes(reason.code)) options.unavailable('keys', keyId);
        }
      }
    } finally {
      pending.flush(); pending.dispose();
      if (ownsRequest()) {
        changeResponse({ state: completed ? 'complete' : failed ? 'failed' : 'stopped' });
        controller = undefined; buffer = undefined;
        update({ activity: completed ? 'Complete' : failed ? 'Failed' : 'Stopped', timing: { firstText, elapsed: performance.now() - started, model: modelId } }, true);
      }
      if (options.isOwner()) options.settled();
    }
  }
  return {
    hydrate: (saved: SavedPlayground, error = snapshot.error) => {
      if (controller || cleared || !options.isOwner()) return;
      nextId = Math.max(0, ...saved.messages.map(message => message.id)) + 1;
      update({ ...saved, error }, true);
    },
    prepend: (messages: SavedPlayground['messages']) => {
      const existingIds = new Set(snapshot.messages.map(message => message.id));
      update({ messages: [...messages.filter(message => !existingIds.has(message.id)), ...snapshot.messages] });
    },
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setDraft: (draft: string) => update({ draft }),
    selectKey: (selectedKey: string) => { if (!controller) update({ selectedKey, selectedModel: null }); },
    selectModel: (selectedModel: string) => { if (!controller) update({ selectedModel }); },
    send, stop, newChat, clear,
    flush: () => { buffer?.flush(); flush(); },
    // Safe for StrictMode's cleanup/setup cycle; persisted state is not deleted.
    detach: () => { stop(); flush(); },
  };
}
export type PlaygroundStore = ReturnType<typeof createPlaygroundStore>;
