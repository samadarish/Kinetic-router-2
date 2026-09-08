import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import type { PlaygroundTurnInput } from '@kineticrouter/portal-contract';
import { MemoryConversationStore, publicConversation, publicTurn, recentContext, unavailableHistory, type ConversationStore, type TurnUpdate } from '../apps/bff/src/conversations';
import { PostgresConversationStore } from '../apps/bff/src/conversations-postgres';

const owner = { id: '42', label: 'customer@example.invalid' };
const update: TurnUpdate = { assistantText: 'Saved reply', state: 'complete', usage: { inputTokens: 17, outputTokens: 23, totalTokens: 40 }, firstTextMs: 20, durationMs: 50, limited: false };
const input = (id: string, revision = 0): PlaygroundTurnInput => ({ conversationId: id, revision, clientTurnId: randomUUID(), apiKeyId: '7', model: 'test-model', message: `Question ${revision}` });
const database = process.env.PLAYGROUND_TEST_DATABASE_URL;

for (const kind of ['memory', ...(database ? ['postgres'] : [])]) describe(`${kind} conversation storage`, () => {
  let store: ConversationStore, admin: Pool | undefined, schema: string;
  beforeEach(async () => {
    if (kind === 'memory') store = new MemoryConversationStore();
    else {
      schema = `playground_test_${randomUUID().replaceAll('-', '')}`;
      admin = new Pool({ connectionString: database, max: 1 });
      await admin.query(`CREATE SCHEMA ${schema}`);
      store = new PostgresConversationStore(database!, { searchPath: schema });
    }
  });
  afterEach(async () => {
    vi.useRealTimers(); await store.close();
    if (admin) { await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); admin = undefined; }
  });
  async function savedChat() {
    const id = randomUUID(); await store.create(owner, id);
    const started = await store.begin(owner.id, input(id)); await store.write(started.turn, update); return { id, started };
  }
  it('isolates owners, stores exact tokens, and exposes only explicit DTO fields', async () => {
    const { id, started } = await savedChat();
    await expect(store.detail('43', id)).rejects.toMatchObject({ status: 404 });
    await expect(store.begin('43', input(id, 1))).rejects.toMatchObject({ status: 404 });
    await expect(store.remove('43', id)).rejects.toMatchObject({ status: 404 });
    await expect(store.create({ id: '43', label: 'Other' }, id)).rejects.toMatchObject({ status: 404 });
    const detail = await store.detail(owner.id, id);
    expect(detail.turns[0]).toMatchObject({ assistantText: update.assistantText, usage: update.usage });
    expect(detail.conversation).toMatchObject({ revision: 1, turnCount: 1, active: false });
    const aliases = ['rateMultiplier', 'rate_multiplier', 'userRateMultiplier', 'user_rate_multiplier', 'resolvedRateMultiplier', 'resolved_rate_multiplier', 'effectiveRateMultiplier', 'effective_rate_multiplier'];
    const poison = Object.fromEntries(aliases.map(name => [name, 'private']));
    const json = JSON.stringify({ chat: publicConversation({ ...detail.conversation, ...poison }), turn: publicTurn({ ...started.turn, ...poison, usage: { ...update.usage!, ...poison } }) });
    for (const name of [...aliases, 'lease', 'payloadHash', 'apiKeyId', 'ownerLabel']) expect(json).not.toContain(`"${name}":`);
  });
  it('accepts only one concurrent turn and prevents duplicate or stale retries', async () => {
    const id = randomUUID(); await store.create(owner, id); const request = input(id);
    const results = await Promise.allSettled([store.begin(owner.id, request), store.begin(owner.id, request)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const success = results.find(result => result.status === 'fulfilled')! as PromiseFulfilledResult<Awaited<ReturnType<ConversationStore['begin']>>>;
    await expect(store.begin(owner.id, input(id, 1))).rejects.toMatchObject({ code: 'CHAT_CHANGED' });
    await store.write(success.value.turn, update);
    await expect(store.begin(owner.id, request)).rejects.toMatchObject({ code: 'TURN_ALREADY_SUBMITTED' });
    await expect(store.begin(owner.id, input(id))).rejects.toMatchObject({ code: 'CHAT_CHANGED' });
    expect((await store.begin(owner.id, input(id, 1))).history).toHaveLength(1);
  });
  it('archives for the customer, retains admin inspection, and cannot resurrect after purge', async () => {
    const id = randomUUID(); await store.create(owner, id);
    const { turn } = await store.begin(owner.id, input(id));
    await store.write(turn, { ...update, state: 'receiving', assistantText: 'Partial' });
    await expect(store.purge('1', id)).rejects.toMatchObject({ status: 409 });
    await store.remove(owner.id, id);
    expect((await store.list(owner.id, {})).items).toHaveLength(0);
    await expect(store.detail(owner.id, id)).rejects.toMatchObject({ status: 404 });
    expect(await store.write(turn, { ...update, assistantText: 'Partial' })).toBe(false);
    const archive = await store.detail(null, id);
    expect(archive.conversation.deletedAt).toBeTruthy(); expect(archive.turns[0]).toMatchObject({ assistantText: 'Partial', state: 'stopped' });
    await store.audit('1', 'inspect', id); await store.purge('1', id);
    expect(await store.write(turn, update)).toBe(false);
    await expect(store.detail(null, id)).rejects.toMatchObject({ status: 404 });
    if (store instanceof MemoryConversationStore) expect(store.audits).toEqual([{ adminId: '1', action: 'inspect', chatId: id }, { adminId: '1', action: 'purge', chatId: id }]);
    if (admin) expect((await admin.query(`SELECT action FROM ${schema}.kr_playground_admin_audit ORDER BY id`)).rows).toEqual([{ action: 'inspect' }, { action: 'purge' }]);
  });
  it('paginates summaries independently of updates or purges at the cursor boundary', async () => {
    for (let i = 0; i < 33; i++) await savedChat();
    const first = await store.list(null, {}); expect(first.items).toHaveLength(30); expect(first.nextCursor).toBeTruthy();
    const boundary = first.items.at(-1)!;
    const next = await store.begin(owner.id, input(boundary.id, 1)); await store.write(next.turn, update);
    const afterUpdate = await store.list(null, { cursor: first.nextCursor! }); expect(afterUpdate.items).toHaveLength(3);
    await store.remove(owner.id, boundary.id); await store.purge('1', boundary.id);
    const afterPurge = await store.list(null, { cursor: first.nextCursor! });
    expect(afterPurge.items.map(chat => chat.id)).toEqual(afterUpdate.items.map(chat => chat.id));
    expect(afterPurge.nextCursor).toBeNull();
    await expect(store.list(null, { cursor: 'invalid' })).rejects.toMatchObject({ status: 400 });
  });
  it('paginates complete transcripts and filters admin lists without returning transcript text', async () => {
    const id = randomUUID(); await store.create(owner, id);
    for (let i = 0; i < 31; i++) { const turn = await store.begin(owner.id, input(id, i)); await store.write(turn.turn, update); }
    const detail = await store.detail(owner.id, id); expect(detail.turns).toHaveLength(30); expect(detail.nextBefore).toBe(2);
    expect((await store.detail(owner.id, id, detail.nextBefore!)).turns[0]!.sequence).toBe(1);
    const page = await store.list(null, { search: 'customer@example', model: 'test-model', deleted: 'active' });
    expect(page.items).toHaveLength(1); expect(JSON.stringify(page)).not.toContain('Saved reply');
    expect((await store.list(null, { search: 'missing' })).items).toHaveLength(0);
    expect((await store.list(owner.id, { model: 'missing' })).items).toHaveLength(0);
  });
  it('marks imported text, keeps it idempotent, and never trusts client token metrics', async () => {
    const id = randomUUID(); const imported = { id, messages: [{ role: 'user' as const, content: 'Old prompt' }, { role: 'assistant' as const, content: 'Old reply', model: 'old-model' }] };
    await store.create(owner, id, imported); await store.create(owner, id, imported);
    const detail = await store.detail(null, id);
    expect(detail.conversation).toMatchObject({ imported: true, turnCount: 1 });
    expect(detail.turns[0]).toMatchObject({ userText: 'Old prompt', assistantText: 'Old reply', usage: null, durationMs: null });
  });
  it('expires crashed receiving leases without resending or allowing a stale writer', async () => {
    const id = randomUUID(); await store.create(owner, id); const started = await store.begin(owner.id, input(id));
    await store.write(started.turn, { ...update, state: 'receiving', assistantText: 'Checkpoint' });
    if (admin) await admin.query(`UPDATE ${schema}.kr_playground_turns SET lease_until=now()-interval '1 second'`);
    else { vi.useFakeTimers(); vi.setSystemTime(Date.now() + 160_000); }
    const detail = await store.detail(owner.id, id);
    expect(detail.turns[0]).toMatchObject({ assistantText: 'Checkpoint', state: 'stopped' }); expect(detail.conversation.active).toBe(false);
    expect(await store.write(started.turn, update)).toBe(false);
    expect((await store.begin(owner.id, input(id, 1))).chat.turnCount).toBe(2);
  });
  if (kind === 'postgres') it('restores saved history after the store process is replaced', async () => {
    const { id } = await savedChat(); await store.close(); store = new PostgresConversationStore(database!, { searchPath: schema });
    expect((await store.detail(owner.id, id)).turns[0]).toMatchObject({ assistantText: update.assistantText, usage: update.usage });
  });
});

describe('server-built context', () => {
  it('keeps recent whole turns within byte and message budgets without mutating history', async () => {
    const store = new MemoryConversationStore(), id = randomUUID(); await store.create(owner, id);
    for (let i = 0; i < 25; i++) { const turn = await store.begin(owner.id, input(id, i)); await store.write(turn.turn, update); }
    const history = (await store.detail(owner.id, id)).turns;
    const snapshot = JSON.stringify(history), context = recentContext(history, input(id, 25));
    expect(context.includedTurns).toBe(19); expect(context.input.messages).toHaveLength(39);
    expect(context.input.messages[0]!.content).toBe('Question 6'); expect(JSON.stringify(history)).toBe(snapshot);
    const large = history.map((turn, index) => ({ ...turn, assistantText: index === 24 ? 'x'.repeat(50_000) : 'x'.repeat(60_000) }));
    const bounded = recentContext(large, input(id, 25)); expect(bounded.includedTurns).toBe(2);
    expect(Buffer.byteLength(JSON.stringify(bounded.input))).toBeLessThan(128 * 1024);
    large[24]!.assistantText = 'x'.repeat(140_000); expect(recentContext(large, input(id)).includedTurns).toBe(0);
    expect(() => recentContext([], { ...input(id), message: 'x'.repeat(140_000) })).toThrow('Shorten');
  });
  it('fails closed when durable storage is not configured', async () => {
    const store = new PostgresConversationStore(''); await expect(store.create(owner, randomUUID())).rejects.toEqual(unavailableHistory()); await store.close();
  });
});
