import { Pool, type PoolClient } from 'pg';
import type { SupportCreateInput, SupportListQuery, SupportReplyInput, SupportStatus, SupportWelcomeQuery } from '@kineticrouter/portal-contract';
import { config } from './config.js';
import {
  SupportError, advanceSupportRead, applySupportMessage, checkBefore, checkedCreate, checkedList, checkedReply, checkedWelcomeList,
  checkSequence, checkStatus, checkSupportReplay, checkTicketId, newSupportMessage, newSupportTicket,
  newSupportWelcome, publicSupportMessage, publicSupportTicket, supportConflict, supportForbidden, supportMissing, supportResolved, supportUnavailable, supportWelcomeRecipient,
  type SupportActor, type SupportImageRecord, type SupportMessageRecord, type SupportStore, type SupportTicketRecord,
} from './support-store.js';

const schema = `
CREATE TABLE IF NOT EXISTS kr_support_tickets (
 id uuid PRIMARY KEY, owner_id text NOT NULL, status text NOT NULL CHECK(status IN ('open','resolved')),
 updated_at timestamptz NOT NULL, data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS kr_support_owner_activity ON kr_support_tickets(owner_id,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS kr_support_admin_activity ON kr_support_tickets(updated_at DESC,id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS kr_support_welcome_owner ON kr_support_tickets(owner_id) WHERE data->>'kind'='welcome';
CREATE TABLE IF NOT EXISTS kr_support_messages (
 id uuid PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES kr_support_tickets(id) ON DELETE CASCADE,
 seq integer NOT NULL CHECK(seq>0), client_message_id uuid NOT NULL,
 sender text NOT NULL CHECK(sender IN ('customer','admin')), data jsonb NOT NULL,
 UNIQUE(ticket_id,seq), UNIQUE(ticket_id,client_message_id)
);
CREATE INDEX IF NOT EXISTS kr_support_unread ON kr_support_messages(ticket_id,sender,seq);
CREATE TABLE IF NOT EXISTS kr_support_images (
 message_id uuid PRIMARY KEY REFERENCES kr_support_messages(id) ON DELETE CASCADE,
 bytes bytea NOT NULL CHECK(octet_length(bytes)>0 AND octet_length(bytes)<=524288),
 mime_type text NOT NULL CHECK(mime_type='image/webp'),
 width integer NOT NULL CHECK(width>0 AND width<=1600), height integer NOT NULL CHECK(height>0 AND height<=1600),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$')
);`;

export class PostgresSupportStore implements SupportStore {
  readonly pool: Pool;
  readonly configured: boolean;
  private initialized?: Promise<void>;
  constructor(private url: string, options: { searchPath?: string } = {}) {
    this.configured = Boolean(url);
    this.pool = new Pool({
      connectionString: url || 'postgresql://127.0.0.1:1/unconfigured', max: 4,
      connectionTimeoutMillis: 1500, idleTimeoutMillis: 30_000, statement_timeout: 5000,
      query_timeout: 6500, application_name: 'kineticrouter-support',
      ...(options.searchPath ? { options: `-c search_path=${options.searchPath}` } : {}),
    });
    this.pool.on('error', () => {});
  }
  private async initialize() {
    if (!this.url) throw supportUnavailable();
    if (!this.initialized) this.initialized = this.transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(741029120)');
      await client.query(schema);
    }, false).catch(error => { this.initialized = undefined; throw error; });
    await this.initialized;
  }
  private async transaction<T>(operation: (client: PoolClient) => Promise<T>, initialize = true): Promise<T> {
    if (initialize) await this.initialize();
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect(); await client.query('BEGIN');
      const result = await operation(client); await client.query('COMMIT'); return result;
    } catch (error) {
      await client?.query('ROLLBACK').catch(() => {});
      if (error instanceof SupportError) throw error;
      throw supportUnavailable();
    } finally { client?.release(); }
  }
  private async locked(client: PoolClient, actor: SupportActor, id: string): Promise<SupportTicketRecord> {
    checkTicketId(id);
    const result = await client.query('SELECT data FROM kr_support_tickets WHERE id=$1 AND ($2::text IS NULL OR owner_id=$2) FOR UPDATE', [id, actor.admin ? null : actor.id]);
    if (!result.rows[0]) throw supportMissing();
    return result.rows[0].data as SupportTicketRecord;
  }
  private async save(client: PoolClient, ticket: SupportTicketRecord) {
    await client.query('UPDATE kr_support_tickets SET status=$2,updated_at=$3,data=$4 WHERE id=$1', [ticket.id, ticket.status, ticket.updatedAt, ticket]);
  }
  private async insertMessage(client: PoolClient, message: SupportMessageRecord, image?: SupportImageRecord) {
    await client.query('INSERT INTO kr_support_messages(id,ticket_id,seq,client_message_id,sender,data) VALUES($1,$2,$3,$4,$5,$6)', [message.id, message.ticketId, message.sequence, message.clientMessageId, message.sender, message]);
    if (image) await client.query('INSERT INTO kr_support_images(message_id,bytes,mime_type,width,height,sha256) VALUES($1,$2,$3,$4,$5,$6)',
      [message.id, image.bytes, image.mimeType, image.width, image.height, image.sha256]);
  }
  private async dto(client: PoolClient, actor: SupportActor, ticket: SupportTicketRecord) {
    const result = await client.query('SELECT count(*) AS unread FROM kr_support_messages WHERE ticket_id=$1 AND sender=$2 AND seq>$3', [ticket.id, actor.admin ? 'customer' : 'admin', actor.admin ? ticket.adminReadSequence : ticket.customerReadSequence]);
    return publicSupportTicket(actor, ticket, Number(result.rows[0].unread));
  }
  async list(actor: SupportActor, input: SupportListQuery) {
    const query = checkedList(input);
    return this.transaction(async client => {
      const values = [actor.admin ? null : actor.id, query.status, query.search];
      const filter = `($1::text IS NULL OR t.owner_id=$1) AND ($2='all' OR t.status=$2)
        AND ($1::text IS NOT NULL OR (t.data->>'kind') IS DISTINCT FROM 'welcome' OR t.data->>'firstReplyAt' IS NOT NULL)
        AND ($3='' OR position(lower($3) in lower((t.data->>'subject') || CASE WHEN $1::text IS NULL THEN ' '||(t.data->>'ownerLabel')||' '||(t.data->>'ownerEmail')||' '||t.owner_id ELSE '' END))>0)`;
      const totals = await client.query(`SELECT count(*) AS total FROM kr_support_tickets t WHERE ${filter}`, values);
      const result = await client.query(`SELECT t.data,
        (SELECT count(*) FROM kr_support_messages m WHERE m.ticket_id=t.id AND m.sender=$4
          AND m.seq>(t.data->>$5)::integer) AS unread
        FROM kr_support_tickets t WHERE ${filter} ORDER BY t.updated_at DESC,t.id DESC LIMIT 30 OFFSET $6`,
      [...values, actor.admin ? 'customer' : 'admin', actor.admin ? 'adminReadSequence' : 'customerReadSequence', (query.page - 1) * 30]);
      const unread = await client.query(`SELECT count(*) AS unread FROM kr_support_messages m
        JOIN kr_support_tickets t ON t.id=m.ticket_id WHERE ($1::text IS NULL OR t.owner_id=$1)
        AND m.sender=$2 AND m.seq>(t.data->>$3)::integer`,
      [actor.admin ? null : actor.id, actor.admin ? 'customer' : 'admin', actor.admin ? 'adminReadSequence' : 'customerReadSequence']);
      return { items: result.rows.map(row => publicSupportTicket(actor, row.data, Number(row.unread))), total: Number(totals.rows[0].total), unreadCount: Number(unread.rows[0].unread) };
    });
  }
  async detail(actor: SupportActor, id: string, before?: number) {
    checkTicketId(id); checkBefore(before);
    return this.transaction(async client => {
      const ticket = await this.locked(client, actor, id);
      const result = await client.query('SELECT data FROM kr_support_messages WHERE ticket_id=$1 AND ($2::bigint IS NULL OR seq<$2) ORDER BY seq DESC LIMIT 50', [id, before ?? null]);
      const messages = result.rows.reverse().map(row => publicSupportMessage(row.data));
      return { ticket: await this.dto(client, actor, ticket), messages, nextBefore: messages[0] && messages[0].sequence > 1 ? messages[0].sequence : null };
    });
  }
  async create(actor: SupportActor, raw: SupportCreateInput, image?: SupportImageRecord) {
    const input = checkedCreate(actor, raw, image);
    return this.transaction(async client => {
      const candidate = newSupportTicket(actor, input);
      const inserted = await client.query('INSERT INTO kr_support_tickets(id,owner_id,status,updated_at,data) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id', [candidate.id, candidate.ownerId, candidate.status, candidate.updatedAt, candidate]);
      if (!inserted.rowCount) {
        const ticket = await this.locked(client, actor, candidate.id);
        const prior = await client.query('SELECT data FROM kr_support_messages WHERE ticket_id=$1 AND seq=1', [ticket.id]);
        const first = prior.rows[0]?.data as SupportMessageRecord | undefined;
        if (!first || ticket.subject !== input.subject || (ticket.preferredLanguage ?? 'en') !== input.preferredLanguage
          || first.clientMessageId !== input.clientMessageId) throw supportConflict();
        checkSupportReplay(actor, first, input, image);
        return { ticket: await this.dto(client, actor, ticket), message: publicSupportMessage(first), created: false, ownerId: ticket.ownerId };
      }
      const message = newSupportMessage(actor, candidate, input, image);
      await this.insertMessage(client, message, image); applySupportMessage(candidate, message); await this.save(client, candidate);
      return { ticket: await this.dto(client, actor, candidate), message: publicSupportMessage(message), created: true, ownerId: candidate.ownerId };
    });
  }
  async reply(actor: SupportActor, id: string, raw: SupportReplyInput, image?: SupportImageRecord) {
    checkTicketId(id);
    const input = checkedReply(actor, raw, image);
    return this.transaction(async client => {
      const ticket = await this.locked(client, actor, id);
      const prior = await client.query('SELECT data FROM kr_support_messages WHERE ticket_id=$1 AND client_message_id=$2', [id, input.clientMessageId]);
      const existing = prior.rows[0]?.data as SupportMessageRecord | undefined;
      if (existing) {
        checkSupportReplay(actor, existing, input, image);
        return { ticket: await this.dto(client, actor, ticket), message: publicSupportMessage(existing), created: false, ownerId: ticket.ownerId };
      }
      if (!actor.admin && ticket.status === 'resolved') throw supportResolved();
      const message = newSupportMessage(actor, ticket, input, image);
      await this.insertMessage(client, message, image); applySupportMessage(ticket, message); await this.save(client, ticket);
      return { ticket: await this.dto(client, actor, ticket), message: publicSupportMessage(message), created: true, ownerId: ticket.ownerId };
    });
  }
  async ensureWelcome(actor: SupportActor) {
    if (actor.admin) throw supportForbidden();
    return this.transaction(async client => {
      const { ticket, message } = newSupportWelcome(actor);
      // The partial owner index serializes first visits across sessions and BFF processes.
      const inserted = await client.query('INSERT INTO kr_support_tickets(id,owner_id,status,updated_at,data) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id', [ticket.id, ticket.ownerId, ticket.status, ticket.updatedAt, ticket]);
      if (inserted.rowCount) {
        await this.insertMessage(client, message);
        return { ticket: await this.dto(client, actor, ticket), message: publicSupportMessage(message), created: true, ownerId: actor.id };
      }
      const result = await client.query("SELECT data FROM kr_support_tickets WHERE owner_id=$1 AND data->>'kind'='welcome' FOR UPDATE", [actor.id]);
      const existing = result.rows[0]?.data as SupportTicketRecord | undefined;
      if (!existing) throw supportUnavailable();
      const first = await client.query('SELECT data FROM kr_support_messages WHERE ticket_id=$1 AND seq=1', [existing.id]);
      if (!first.rows[0]) throw supportUnavailable();
      return { ticket: await this.dto(client, actor, existing), message: publicSupportMessage(first.rows[0].data), created: false, ownerId: actor.id };
    });
  }
  async viewWelcome(actor: SupportActor) {
    if (actor.admin) throw supportForbidden();
    return this.transaction(async client => {
      const result = await client.query("SELECT data FROM kr_support_tickets WHERE owner_id=$1 AND data->>'kind'='welcome' FOR UPDATE", [actor.id]);
      const ticket = result.rows[0]?.data as SupportTicketRecord | undefined;
      if (!ticket) throw supportMissing();
      const changed = !ticket.firstViewedAt;
      if (changed) { ticket.firstViewedAt = new Date().toISOString(); await this.save(client, ticket); }
      return { ticketId: ticket.id, changed };
    });
  }
  async welcomeList(actor: SupportActor, input: SupportWelcomeQuery) {
    const query = checkedWelcomeList(actor, input);
    return this.transaction(async client => {
      const filter = `data->>'kind'='welcome' AND ($1='' OR position(lower($1) in lower((data->>'ownerLabel')||' '||(data->>'ownerEmail')||' '||owner_id))>0)`;
      const totals = await client.query(`SELECT count(*) AS total FROM kr_support_tickets WHERE ${filter}`, [query.search]);
      const result = await client.query(`SELECT data FROM kr_support_tickets WHERE ${filter} ORDER BY data->>'createdAt' DESC,id DESC LIMIT 30 OFFSET $2`, [query.search, (query.page - 1) * 30]);
      return { items: result.rows.map(row => supportWelcomeRecipient(row.data)), total: Number(totals.rows[0].total) };
    });
  }
  async image(actor: SupportActor, id: string, messageId: string): Promise<SupportImageRecord> {
    checkTicketId(id); checkTicketId(messageId);
    return this.transaction(async client => {
      const result = await client.query(`SELECT i.bytes,i.mime_type,i.width,i.height,i.sha256
        FROM kr_support_images i JOIN kr_support_messages m ON m.id=i.message_id
        JOIN kr_support_tickets t ON t.id=m.ticket_id
        WHERE t.id=$1 AND m.id=$2 AND ($3::text IS NULL OR t.owner_id=$3)`, [id, messageId, actor.admin ? null : actor.id]);
      const image = result.rows[0];
      if (!image) throw supportMissing();
      return { bytes: image.bytes, mimeType: image.mime_type, width: image.width, height: image.height, byteSize: image.bytes.length, sha256: image.sha256 };
    });
  }
  async read(actor: SupportActor, id: string, sequence: number) {
    checkTicketId(id); checkSequence(sequence);
    return this.transaction(async client => {
      const ticket = await this.locked(client, actor, id), changed = advanceSupportRead(actor, ticket, sequence);
      if (changed) await this.save(client, ticket);
      return { ownerId: ticket.ownerId, changed };
    });
  }
  async setStatus(actor: SupportActor, id: string, status: SupportStatus) {
    checkStatus(actor, status); checkTicketId(id);
    return this.transaction(async client => {
      const ticket = await this.locked(client, actor, id);
      const changed = ticket.status !== status;
      if (changed) { ticket.status = status; ticket.updatedAt = new Date().toISOString(); await this.save(client, ticket); }
      return { ownerId: ticket.ownerId, changed };
    });
  }
  async health() { await this.transaction(async client => { await client.query('SELECT 1'); }); }
  async close() { await this.pool.end(); }
}

export function createSupportStore(): SupportStore {
  return new PostgresSupportStore(config.supportDatabaseUrl || config.playgroundDatabaseUrl || config.analyticsDatabaseUrl);
}
