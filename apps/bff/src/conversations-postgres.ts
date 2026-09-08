import { Pool, type PoolClient } from 'pg';
import type { ConversationImportInput, PlaygroundTurnInput } from '@kineticrouter/portal-contract';
import { ConversationError, MemoryConversationStore, conflictingTurn, importedTurns, missingConversation, newChat, newTurn, publicTurn, titleFrom, unavailableHistory, type ChatRecord, type ConversationStore, type HistoryQuery, type Owner, type TurnRecord, type TurnUpdate } from './conversations.js';
import { config } from './config.js';
import { historyCursor, readHistoryCursor } from './conversations.js';

const schema = `
CREATE TABLE IF NOT EXISTS kr_playground_chats (
 id uuid PRIMARY KEY, owner_id text NOT NULL, updated_at timestamptz NOT NULL, deleted_at timestamptz, data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS kr_playground_owner_history ON kr_playground_chats(owner_id, updated_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS kr_playground_admin_history ON kr_playground_chats(updated_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS kr_playground_turns (
 id uuid PRIMARY KEY, chat_id uuid NOT NULL REFERENCES kr_playground_chats(id) ON DELETE CASCADE,
 seq integer NOT NULL, client_turn_id uuid NOT NULL, state text NOT NULL CHECK(state IN ('receiving','complete','stopped','failed')),
 lease uuid NOT NULL, lease_until timestamptz NOT NULL, data jsonb NOT NULL,
 UNIQUE(chat_id,seq), UNIQUE(chat_id,client_turn_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS kr_playground_one_active_turn ON kr_playground_turns(chat_id) WHERE state='receiving';
CREATE TABLE IF NOT EXISTS kr_playground_admin_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, admin_id text NOT NULL, action text NOT NULL,
 chat_id uuid, at timestamptz NOT NULL DEFAULT now()
);`;

export class PostgresConversationStore implements ConversationStore {
  readonly pool: Pool;
  private initialized?: Promise<void>;
  constructor(private url: string, options: { searchPath?: string } = {}) {
    this.pool = new Pool({ connectionString: url || 'postgresql://127.0.0.1:1/unconfigured', max: 4, connectionTimeoutMillis: 1500, idleTimeoutMillis: 30_000, statement_timeout: 5000, query_timeout: 6500, application_name: 'kineticrouter-playground', ...(options.searchPath ? { options: `-c search_path=${options.searchPath}` } : {}) });
    this.pool.on('error', () => {});
  }
  private async initialize() {
    if (!this.url) throw unavailableHistory();
    if (!this.initialized) this.initialized = this.transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(741029119)'); await client.query(schema);
    }, false).catch(error => { this.initialized = undefined; throw error; });
    await this.initialized;
  }
  private async transaction<T>(operation: (client: PoolClient) => Promise<T>, initialize = true): Promise<T> {
    if (initialize) await this.initialize();
    let client: PoolClient | undefined;
    try { client = await this.pool.connect(); await client.query('BEGIN'); const result = await operation(client); await client.query('COMMIT'); return result; }
    catch (error) { await client?.query('ROLLBACK').catch(() => {}); if (error instanceof ConversationError) throw error; throw unavailableHistory(); }
    finally { client?.release(); }
  }
  private async locked(client: PoolClient, owner: string | null, id: string): Promise<ChatRecord> {
    const result = await client.query('SELECT data,deleted_at FROM kr_playground_chats WHERE id=$1 AND ($2::text IS NULL OR (owner_id=$2 AND deleted_at IS NULL)) FOR UPDATE', [id, owner]);
    if (!result.rows[0]) throw missingConversation();
    await client.query("UPDATE kr_playground_turns SET state='stopped',data=data||jsonb_build_object('finishedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')) WHERE chat_id=$1 AND state='receiving' AND lease_until<now()", [id]);
    const active = await client.query("SELECT 1 FROM kr_playground_turns WHERE chat_id=$1 AND state='receiving' LIMIT 1", [id]);
    return { ...result.rows[0].data, deletedAt: result.rows[0].deleted_at?.toISOString() ?? null, active: active.rowCount === 1 };
  }
  private async saveChat(client: PoolClient, chat: ChatRecord) { await client.query('UPDATE kr_playground_chats SET updated_at=$2,deleted_at=$3,data=$4 WHERE id=$1', [chat.id, chat.updatedAt, chat.deletedAt, chat]); }
  private async insertTurn(client: PoolClient, turn: TurnRecord) { await client.query('INSERT INTO kr_playground_turns(id,chat_id,seq,client_turn_id,state,lease,lease_until,data) VALUES($1,$2,$3,$4,$5,$6,now()+interval \'150 seconds\',$7)', [turn.id, turn.chatId, turn.sequence, turn.clientTurnId, turn.state, turn.lease, turn]); }
  async create(owner: Owner, id: string, imported?: ConversationImportInput) {
    return this.transaction(async client => {
      const chat = newChat(owner, id, Boolean(imported));
      const inserted = await client.query('INSERT INTO kr_playground_chats(id,owner_id,updated_at,data) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id', [id, owner.id, chat.updatedAt, chat]);
      if (!inserted.rowCount) { const current = await this.locked(client, owner.id, id); if (current.imported !== Boolean(imported)) throw conflictingTurn(); return current; }
      if (imported) {
        const turns = importedTurns(chat, imported); for (const turn of turns) await this.insertTurn(client, turn);
        chat.turnCount = turns.length; chat.title = titleFrom(turns[0]!.userText); chat.selectedModel = turns.at(-1)!.model; await this.saveChat(client, chat);
      }
      return chat;
    });
  }
  async list(owner: string | null, query: HistoryQuery) {
    const cursor = readHistoryCursor(query.cursor);
    return this.transaction(async client => {
      const result = await client.query(`SELECT c.data,c.deleted_at,
        EXISTS(SELECT 1 FROM kr_playground_turns t WHERE t.chat_id=c.id AND t.state='receiving' AND t.lease_until>now()) AS active
        FROM kr_playground_chats c WHERE (c.data->>'turnCount')::integer>0
        AND ($1::text IS NULL OR (c.owner_id=$1 AND c.deleted_at IS NULL))
        AND ($2='' OR position(lower($2) in lower((c.data->>'title')||CASE WHEN $1::text IS NULL THEN ' '||(c.data->>'ownerLabel')||' '||c.owner_id ELSE '' END))>0)
        AND ($3='' OR EXISTS(SELECT 1 FROM kr_playground_turns t WHERE t.chat_id=c.id AND t.data->>'model'=$3))
        AND ($4='all' OR ($4='deleted' AND c.deleted_at IS NOT NULL) OR ($4='active' AND c.deleted_at IS NULL))
        AND ($5::date IS NULL OR c.updated_at >= $5::date) AND ($6::date IS NULL OR c.updated_at < $6::date+interval '1 day')
        AND ($7::timestamptz IS NULL OR (c.updated_at,c.id)<($7::timestamptz,$8::uuid))
        ORDER BY c.updated_at DESC,c.id DESC LIMIT 31`, [owner, query.search ?? '', query.model ?? '', query.deleted ?? 'all', query.start ?? null, query.end ?? null, cursor?.updatedAt ?? null, cursor?.id ?? null]);
      const items = result.rows.slice(0, 30).map(row => ({ ...row.data, deletedAt: row.deleted_at?.toISOString() ?? null, active: row.active }) as ChatRecord);
      return { items, nextCursor: result.rows.length > 30 ? historyCursor(items.at(-1)!) : null };
    });
  }
  async detail(owner: string | null, id: string, before?: number) {
    return this.transaction(async client => {
      const chat = await this.locked(client, owner, id);
      const result = await client.query('SELECT data,state FROM kr_playground_turns WHERE chat_id=$1 AND ($2::integer IS NULL OR seq<$2) ORDER BY seq DESC LIMIT 30', [id, before ?? null]);
      const turns = result.rows.reverse().map(row => publicTurn({ ...row.data, state: row.state }));
      return { conversation: chat, turns, nextBefore: turns[0] && turns[0].sequence > 1 ? turns[0].sequence : null };
    });
  }
  async begin(owner: string, input: PlaygroundTurnInput) {
    return this.transaction(async client => {
      const chat = await this.locked(client, owner, input.conversationId);
      const duplicate = await client.query('SELECT 1 FROM kr_playground_turns WHERE chat_id=$1 AND client_turn_id=$2', [chat.id, input.clientTurnId]);
      if (duplicate.rowCount) throw new ConversationError(409, 'TURN_ALREADY_SUBMITTED', 'This message was already submitted. Reload the conversation to see its result.');
      if (chat.revision !== input.revision || chat.active) throw conflictingTurn();
      const prior = await client.query('SELECT data,state FROM kr_playground_turns WHERE chat_id=$1 ORDER BY seq DESC LIMIT 40', [chat.id]);
      const turn = newTurn(chat, input); await this.insertTurn(client, turn);
      chat.turnCount++; chat.revision++; chat.active = true; chat.selectedKey = input.apiKeyId; chat.selectedModel = input.model; chat.updatedAt = turn.createdAt;
      if (chat.turnCount === 1) chat.title = titleFrom(input.message); await this.saveChat(client, chat);
      return { chat, turn, history: prior.rows.reverse().map(row => publicTurn({ ...row.data, state: row.state })) };
    });
  }
  async write(turn: TurnRecord, update: TurnUpdate) {
    return this.transaction(async client => {
      const chatRow = await client.query('SELECT deleted_at FROM kr_playground_chats WHERE id=$1 FOR UPDATE', [turn.chatId]);
      if (!chatRow.rows[0]) return false;
      const deleted = Boolean(chatRow.rows[0].deleted_at), state = deleted ? 'stopped' : update.state;
      const data = { ...update, state, finishedAt: state === 'receiving' ? null : new Date().toISOString() };
      const result = await client.query("UPDATE kr_playground_turns SET data=data||$3::jsonb,state=$4,lease_until=now()+interval '150 seconds' WHERE id=$1 AND lease=$2 AND state='receiving' RETURNING id", [turn.id, turn.lease, data, state]);
      return result.rowCount === 1 && !deleted;
    });
  }
  async remove(owner: string, id: string) {
    await this.transaction(async client => { const chat = await this.locked(client, owner, id); chat.deletedAt = new Date().toISOString(); chat.revision++; await this.saveChat(client, chat); });
  }
  async purge(adminId: string, id: string) {
    await this.transaction(async client => { const chat = await this.locked(client, null, id); if (!chat.deletedAt) throw conflictingTurn(); await client.query("INSERT INTO kr_playground_admin_audit(admin_id,action,chat_id) VALUES($1,'purge',$2)", [adminId, id]); await client.query('DELETE FROM kr_playground_chats WHERE id=$1', [id]); });
  }
  async audit(adminId: string, action: 'list' | 'inspect', chatId?: string) { await this.transaction(async client => { await client.query('INSERT INTO kr_playground_admin_audit(admin_id,action,chat_id) VALUES($1,$2,$3)', [adminId, action, chatId ?? null]); }); }
  async close() { await this.pool.end(); }
}
export function createConversationStore(): ConversationStore {
  if (process.env.VITEST || config.nodeEnv === 'test') return new MemoryConversationStore();
  return new PostgresConversationStore(config.playgroundDatabaseUrl || config.analyticsDatabaseUrl);
}
