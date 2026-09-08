import { playgroundKeyIdSchema, playgroundModelSchema, type PlaygroundUsage } from '@kineticrouter/portal-contract';
import type { ConversationMessage } from './playground-state';

export type PlaygroundActivity = 'Ready' | 'Sending' | 'Receiving' | 'Complete' | 'Stopped' | 'Failed';
export type PlaygroundTiming = { firstText?: number; elapsed?: number; model?: string };
export type SavedPlayground = {
  selectedKey: string | null; selectedModel: string | null; messages: ConversationMessage[];
  draft: string; activity: PlaygroundActivity; timing: PlaygroundTiming;
};
export type PlaygroundStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const PLAYGROUND_STORAGE_KEY = 'kineticrouter-playground-v1';
// A storage limit only: an oversized conversation stays intact in memory.
const MAX_SNAPSHOT_LENGTH = 2 * 1024 * 1024;
export const persistenceNotice = 'This chat is kept while the console stays open, but could not be saved for a refresh.';

export const emptyPlayground = (): SavedPlayground => ({ selectedKey: null, selectedModel: null, messages: [], draft: '', activity: 'Ready', timing: {} });

export function browserPlaygroundStorage(): PlaygroundStorage | undefined {
  try { return window.sessionStorage; } catch { return undefined; }
}

export function readPlayground(storage: PlaygroundStorage | undefined, userId: string): { saved: SavedPlayground; notice: string; discard: boolean } {
  const empty = { saved: emptyPlayground(), notice: '', discard: false };
  try {
    if (!storage) return { ...empty, notice: persistenceNotice };
    const raw = storage.getItem(PLAYGROUND_STORAGE_KEY);
    if (!raw) return empty;
    if (raw.length > MAX_SNAPSHOT_LENGTH) throw new Error('Snapshot too large');
    const value: unknown = JSON.parse(raw);
    if (!record(value) || value.version !== 1 || typeof value.userId !== 'string') throw new Error('Invalid snapshot');
    if (value.userId !== userId) return { ...empty, discard: true };
    if (!record(value.chat)) throw new Error('Invalid chat');
    const chat = value.chat;
    if (chat.selectedKey !== null && !playgroundKeyIdSchema.safeParse(chat.selectedKey).success) throw new Error('Invalid key');
    if (chat.selectedModel !== null && !playgroundModelSchema.safeParse(chat.selectedModel).success) throw new Error('Invalid model');
    if (typeof chat.draft !== 'string' || chat.draft.length > 32_000 || !Array.isArray(chat.messages) || chat.messages.length > 40) throw new Error('Invalid messages');
    const ids = new Set<number>();
    const messages = chat.messages.map((item: unknown): ConversationMessage => {
      if (!record(item) || !Number.isSafeInteger(item.id) || Number(item.id) < 1 || Number(item.id) > Number.MAX_SAFE_INTEGER - 2 || ids.has(Number(item.id)) || typeof item.role !== 'string' || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string') throw new Error('Invalid message');
      ids.add(Number(item.id));
      if (item.role === 'user' && item.content.length > 32_000) throw new Error('Invalid prompt');
      if (item.model !== undefined && !playgroundModelSchema.safeParse(item.model).success) throw new Error('Invalid model');
      if (item.state !== undefined && (typeof item.state !== 'string' || !['complete', 'stopped', 'failed'].includes(item.state))) throw new Error('Invalid state');
      if (item.limited !== undefined && typeof item.limited !== 'boolean') throw new Error('Invalid output flag');
      let usage: PlaygroundUsage | undefined;
      if (item.usage !== undefined) {
        if (!record(item.usage) || !['inputTokens', 'outputTokens', 'totalTokens'].every(key => Number.isSafeInteger(item.usage && (item.usage as Record<string, unknown>)[key]) && Number((item.usage as Record<string, unknown>)[key]) >= 0)) throw new Error('Invalid usage');
        usage = { inputTokens: Number(item.usage.inputTokens), outputTokens: Number(item.usage.outputTokens), totalTokens: Number(item.usage.totalTokens) };
      }
      return { id: Number(item.id), role: item.role as ConversationMessage['role'], content: item.content,
        ...(typeof item.model === 'string' ? { model: item.model } : {}), ...(usage ? { usage } : {}),
        ...(item.role === 'assistant' ? { state: item.state as ConversationMessage['state'] ?? 'stopped' } : {}),
        ...(typeof item.limited === 'boolean' ? { limited: item.limited } : {}),
      };
    });
    if (typeof chat.activity !== 'string' || !['Ready', 'Sending', 'Receiving', 'Complete', 'Stopped', 'Failed'].includes(chat.activity) || !record(chat.timing)) throw new Error('Invalid activity');
    const timing: PlaygroundTiming = {};
    for (const key of ['firstText', 'elapsed'] as const) {
      if (chat.timing[key] !== undefined) {
        if (typeof chat.timing[key] !== 'number' || !Number.isFinite(chat.timing[key]) || chat.timing[key] < 0) throw new Error('Invalid timing');
        timing[key] = chat.timing[key];
      }
    }
    if (chat.timing.model !== undefined) timing.model = playgroundModelSchema.parse(chat.timing.model);
    return { saved: { selectedKey: chat.selectedKey as string | null, selectedModel: chat.selectedModel as string | null, messages, draft: chat.draft,
      activity: chat.activity === 'Sending' || chat.activity === 'Receiving' ? 'Stopped' : chat.activity as PlaygroundActivity, timing }, notice: '', discard: false };
  } catch { return { ...empty, notice: 'The saved chat could not be restored. This conversation starts fresh.', discard: true }; }
}

export function writePlayground(storage: PlaygroundStorage | undefined, userId: string, chat: SavedPlayground): boolean {
  try {
    if (!storage) return false;
    // Select fields explicitly. Credentials and query responses are never persisted.
    const raw = JSON.stringify({ version: 1, userId, chat: {
      selectedKey: chat.selectedKey, selectedModel: chat.selectedModel, draft: chat.draft, activity: chat.activity,
      timing: { firstText: chat.timing.firstText, elapsed: chat.timing.elapsed, model: chat.timing.model },
      messages: chat.messages.map(message => ({ id: message.id, role: message.role, content: message.content, model: message.model,
        state: message.state, limited: message.limited,
        usage: message.usage ? { inputTokens: message.usage.inputTokens, outputTokens: message.usage.outputTokens, totalTokens: message.usage.totalTokens } : undefined,
      })),
    } });
    if (raw.length > MAX_SNAPSHOT_LENGTH) throw new Error('Snapshot too large');
    storage.setItem(PLAYGROUND_STORAGE_KEY, raw);
    return true;
  } catch { clearPlaygroundStorage(storage); return false; }
}

export function clearPlaygroundStorage(storage: PlaygroundStorage | undefined) {
  try { storage?.removeItem(PLAYGROUND_STORAGE_KEY); } catch { /* Storage may be disabled. */ }
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
