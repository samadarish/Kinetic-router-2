import { createHash, randomUUID } from 'node:crypto';
import type { AdminConversation, Conversation, ConversationDetail, ConversationImportInput, ConversationPage, ConversationTurn, PlaygroundChatInput, PlaygroundTurnInput, PlaygroundUsage } from '@kineticrouter/portal-contract';

export class ConversationError extends Error {
  constructor(readonly status: 400 | 404 | 409 | 503, readonly code: string, message: string) { super(message); }
}
export const unavailableHistory = () => new ConversationError(503, 'HISTORY_UNAVAILABLE', 'Chat history could not be saved or loaded. Try again shortly.');
export const missingConversation = () => new ConversationError(404, 'CHAT_NOT_FOUND', 'This conversation is no longer available.');
export const conflictingTurn = () => new ConversationError(409, 'CHAT_CHANGED', 'This conversation changed or already has a reply running. Reload it before sending.');
export type Owner = { id: string; label: string };
export type ChatRecord = AdminConversation;
export type TurnRecord = ConversationTurn & { chatId: string; clientTurnId: string; payloadHash: string; lease: string; leaseUntil: number; apiKeyId: string | null };
export type TurnUpdate = { assistantText: string; usage: PlaygroundUsage | null; firstTextMs: number | null; durationMs: number | null; limited: boolean; state: ConversationTurn['state'] };
export type HistoryQuery = { cursor?: string; search?: string; model?: string; deleted?: 'all' | 'active' | 'deleted'; start?: string; end?: string };
export function historyCursor(chat: ChatRecord) { return `${chat.updatedAt}_${chat.id}`; }
export function readHistoryCursor(value?: string) {
  if (value === undefined) return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i.exec(value);
  if (!match || !Number.isFinite(Date.parse(match[1]!)) || new Date(match[1]!).toISOString() !== match[1]) throw new ConversationError(400, 'INVALID_CURSOR', 'The history cursor is invalid.');
  return { updatedAt: match[1]!, id: match[2]!.toLowerCase() };
}
export interface ConversationStore {
  create(owner: Owner, id: string, imported?: ConversationImportInput): Promise<ChatRecord>;
  list(ownerId: string | null, query: HistoryQuery): Promise<ConversationPage<ChatRecord>>;
  detail(ownerId: string | null, id: string, before?: number): Promise<ConversationDetail<ChatRecord>>;
  begin(ownerId: string, input: PlaygroundTurnInput): Promise<{ chat: ChatRecord; turn: TurnRecord; history: ConversationTurn[] }>;
  write(turn: TurnRecord, update: TurnUpdate): Promise<boolean>;
  remove(ownerId: string, id: string): Promise<void>;
  purge(adminId: string, id: string): Promise<void>;
  audit(adminId: string, action: 'list' | 'inspect', chatId?: string): Promise<void>;
  close(): Promise<void>;
}
export function publicConversation(chat: ChatRecord): Conversation {
  return { id: chat.id, title: chat.title, revision: chat.revision, createdAt: chat.createdAt, updatedAt: chat.updatedAt, turnCount: chat.turnCount, selectedKey: chat.selectedKey, selectedModel: chat.selectedModel, active: chat.active };
}
export function adminConversation(chat: ChatRecord): AdminConversation {
  return { ...publicConversation(chat), ownerId: chat.ownerId, ownerLabel: chat.ownerLabel, deletedAt: chat.deletedAt, imported: chat.imported };
}
export function publicTurn(turn: ConversationTurn): ConversationTurn {
  return { id: turn.id, sequence: turn.sequence, userText: turn.userText, assistantText: turn.assistantText, model: turn.model, state: turn.state, createdAt: turn.createdAt, finishedAt: turn.finishedAt,
    usage: turn.usage ? { inputTokens: turn.usage.inputTokens, outputTokens: turn.usage.outputTokens, totalTokens: turn.usage.totalTokens } : null, firstTextMs: turn.firstTextMs, durationMs: turn.durationMs, limited: turn.limited };
}
export function newChat(owner: Owner, id: string, imported = false): ChatRecord {
  const now = new Date().toISOString();
  return { id, ownerId: owner.id, ownerLabel: owner.label, title: 'New chat', revision: 0, createdAt: now, updatedAt: now, turnCount: 0, selectedKey: null, selectedModel: null, active: false, deletedAt: null, imported };
}
export function titleFrom(text: string) { return text.replace(/\s+/g, ' ').trim().slice(0, 80) || 'New chat'; }
export function turnHash(input: PlaygroundTurnInput) { return createHash('sha256').update(JSON.stringify([input.apiKeyId, input.model, input.message])).digest('hex'); }
export function newTurn(chat: ChatRecord, input: PlaygroundTurnInput): TurnRecord {
  return { id: randomUUID(), chatId: chat.id, clientTurnId: input.clientTurnId, payloadHash: turnHash(input), lease: randomUUID(), leaseUntil: Date.now() + 150_000, sequence: chat.turnCount + 1,
    userText: input.message, assistantText: '', model: input.model, apiKeyId: input.apiKeyId, state: 'receiving', createdAt: new Date().toISOString(), finishedAt: null, usage: null, firstTextMs: null, durationMs: null, limited: false };
}
export function importedTurns(chat: ChatRecord, input: ConversationImportInput): TurnRecord[] {
  const turns: TurnRecord[] = [];
  for (let index = 0; index < input.messages.length; index += 2) {
    const user = input.messages[index]!, assistant = input.messages[index + 1];
    turns.push({ ...newTurn({ ...chat, turnCount: turns.length }, { conversationId: chat.id, clientTurnId: randomUUID(), revision: 0, apiKeyId: '1', model: assistant?.model ?? user.model ?? 'imported', message: user.content }),
      apiKeyId: null, model: assistant?.model ?? user.model ?? null, assistantText: assistant?.content ?? '', state: 'stopped', finishedAt: chat.createdAt, leaseUntil: 0 });
  }
  return turns;
}
/** Contiguous recent turns only; no summarization and no cross-chat context. */
export function recentContext(history: ConversationTurn[], input: PlaygroundTurnInput, systemPrompt?: string): { input: PlaygroundChatInput; includedTurns: number } {
  let messages: PlaygroundChatInput['messages'] = [{ role: 'user', content: input.message }];
  let includedTurns = 0;
  const fits = (items: PlaygroundChatInput['messages']) => items.length + (systemPrompt ? 1 : 0) <= 40 && Buffer.byteLength(JSON.stringify({ model: input.model, messages: [...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []), ...items], stream: true, stream_options: { include_usage: true }, max_completion_tokens: 8192 })) <= 128 * 1024;
  if (!fits(messages)) throw new ConversationError(400, 'MESSAGE_TOO_LARGE', 'Shorten your message before sending.');
  for (const turn of [...history].reverse()) {
    const pair: PlaygroundChatInput['messages'] = [{ role: 'user', content: turn.userText }, ...(turn.assistantText ? [{ role: 'assistant' as const, content: turn.assistantText }] : [])];
    if (!fits([...pair, ...messages])) break;
    messages = [...pair, ...messages]; includedTurns++;
  }
  return { input: { apiKeyId: input.apiKeyId, model: input.model, messages }, includedTurns };
}

/** Injected test fixture only. Real development and production use PostgreSQL. */
export class MemoryConversationStore implements ConversationStore {
  private chats = new Map<string, ChatRecord>();
  private turns = new Map<string, TurnRecord[]>();
  readonly audits: { adminId: string; action: string; chatId?: string }[] = [];
  private get(owner: string | null, id: string) {
    const chat = this.chats.get(id);
    if (!chat || (owner !== null && (chat.ownerId !== owner || chat.deletedAt))) throw missingConversation();
    for (const turn of this.turns.get(id) ?? []) if (turn.state === 'receiving' && turn.leaseUntil < Date.now()) { turn.state = 'stopped'; turn.finishedAt = new Date().toISOString(); }
    chat.active = (this.turns.get(id) ?? []).some(turn => turn.state === 'receiving');
    return chat;
  }
  async create(owner: Owner, id: string, imported?: ConversationImportInput) {
    if (this.chats.has(id)) { const chat = this.get(owner.id, id); if (chat.imported !== Boolean(imported)) throw conflictingTurn(); return structuredClone(chat); }
    const chat = newChat(owner, id, Boolean(imported));
    const turns = imported ? importedTurns(chat, imported) : [];
    chat.turnCount = turns.length; if (turns.length) { chat.title = titleFrom(turns[0]!.userText); chat.selectedModel = turns.at(-1)!.model; }
    this.chats.set(id, chat); this.turns.set(id, turns); return structuredClone(chat);
  }
  async list(owner: string | null, query: HistoryQuery) {
    const cursor = readHistoryCursor(query.cursor);
    const rows = [...this.chats.values()].filter(chat => chat.turnCount > 0 && (owner === null || (owner === chat.ownerId && !chat.deletedAt)) &&
      (!query.search || `${chat.title} ${owner === null ? chat.ownerLabel + ' ' + chat.ownerId : ''}`.toLowerCase().includes(query.search.toLowerCase())) &&
      (!query.model || this.turns.get(chat.id)?.some(turn => turn.model === query.model)) &&
      (query.deleted !== 'deleted' || chat.deletedAt) && (query.deleted !== 'active' || !chat.deletedAt) &&
      (!query.start || chat.updatedAt.slice(0, 10) >= query.start) && (!query.end || chat.updatedAt.slice(0, 10) <= query.end))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
    const remaining = cursor ? rows.filter(chat => chat.updatedAt < cursor.updatedAt || (chat.updatedAt === cursor.updatedAt && chat.id < cursor.id)) : rows;
    const items = remaining.slice(0, 30).map(chat => structuredClone(this.get(owner, chat.id)));
    return { items, nextCursor: remaining.length > 30 ? historyCursor(items.at(-1)!) : null };
  }
  async detail(owner: string | null, id: string, before?: number) {
    const chat = this.get(owner, id); const rows = this.turns.get(id)!.filter(turn => before === undefined || turn.sequence < before).slice(-30);
    return { conversation: structuredClone(chat), turns: rows.map(publicTurn), nextBefore: rows[0] && rows[0].sequence > 1 ? rows[0].sequence : null };
  }
  async begin(owner: string, input: PlaygroundTurnInput) {
    const chat = this.get(owner, input.conversationId), turns = this.turns.get(chat.id)!;
    if (turns.some(turn => turn.clientTurnId === input.clientTurnId)) throw new ConversationError(409, 'TURN_ALREADY_SUBMITTED', 'This message was already submitted. Reload the conversation to see its result.');
    if (chat.revision !== input.revision || chat.active) throw conflictingTurn();
    const turn = newTurn(chat, input), history = turns.slice(-40).map(publicTurn);
    turns.push(turn); chat.revision++; chat.turnCount++; chat.active = true; chat.selectedKey = input.apiKeyId; chat.selectedModel = input.model; chat.updatedAt = turn.createdAt; if (chat.turnCount === 1) chat.title = titleFrom(input.message);
    return structuredClone({ chat, turn, history });
  }
  async write(turn: TurnRecord, update: TurnUpdate) {
    const chat = this.chats.get(turn.chatId), saved = this.turns.get(turn.chatId)?.find(row => row.id === turn.id);
    if (!chat || !saved || saved.lease !== turn.lease || saved.state !== 'receiving') return false;
    Object.assign(saved, update, { state: chat.deletedAt ? 'stopped' : update.state, leaseUntil: Date.now() + 150_000, finishedAt: update.state !== 'receiving' || chat.deletedAt ? new Date().toISOString() : null });
    chat.active = saved.state === 'receiving'; return !chat.deletedAt;
  }
  async remove(owner: string, id: string) { const chat = this.get(owner, id); chat.deletedAt = new Date().toISOString(); chat.revision++; }
  async purge(adminId: string, id: string) { const chat = this.get(null, id); if (!chat.deletedAt) throw conflictingTurn(); this.audits.push({ adminId, action: 'purge', chatId: id }); this.chats.delete(id); this.turns.delete(id); }
  async audit(adminId: string, action: 'list' | 'inspect', chatId?: string) { this.audits.push({ adminId, action, chatId }); }
  async close() {}
}
