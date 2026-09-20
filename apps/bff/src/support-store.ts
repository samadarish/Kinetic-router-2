import { randomUUID } from 'node:crypto';
import {
  supportCreateSchema, supportListSchema, supportReplySchema, supportWelcomeListSchema,
  type SupportCreateInput, type SupportDetail, type SupportListQuery, type SupportMessage,
  type SupportReplyInput, type SupportStatus, type SupportTicket, type SupportTicketPage,
  type SupportWelcomePage, type SupportWelcomeQuery, type SupportWelcomeRecipient,
} from '@kineticrouter/portal-contract';

export type SupportActor = { id: string; label: string; email: string; admin: boolean };
/** Validated, normalized image data. Bytes are persisted separately from message JSON. */
export type SupportImageRecord = { bytes: Buffer; mimeType: 'image/webp'; width: number; height: number; byteSize: number; sha256: string };
export type SupportWriteResult = { ticket: SupportTicket; message: SupportMessage; created: boolean; ownerId: string };
export interface SupportStore {
  readonly configured: boolean;
  list(actor: SupportActor, query: SupportListQuery): Promise<SupportTicketPage>;
  detail(actor: SupportActor, id: string, before?: number): Promise<SupportDetail>;
  create(actor: SupportActor, input: SupportCreateInput, image?: SupportImageRecord): Promise<SupportWriteResult>;
  ensureWelcome(actor: SupportActor): Promise<SupportWriteResult>;
  viewWelcome(actor: SupportActor): Promise<{ ticketId: string; changed: boolean }>;
  welcomeList(actor: SupportActor, query: SupportWelcomeQuery): Promise<SupportWelcomePage>;
  reply(actor: SupportActor, id: string, input: SupportReplyInput, image?: SupportImageRecord): Promise<SupportWriteResult>;
  image(actor: SupportActor, id: string, messageId: string): Promise<SupportImageRecord>;
  read(actor: SupportActor, id: string, sequence: number): Promise<{ ownerId: string; changed: boolean }>;
  setStatus(actor: SupportActor, id: string, status: SupportStatus): Promise<{ ownerId: string; changed: boolean }>;
  health(): Promise<void>;
  close(): Promise<void>;
}

export class SupportError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 429 | 503, readonly code: string, message: string) { super(message); }
}
export const supportUnavailable = () => new SupportError(503, 'SUPPORT_UNAVAILABLE', 'Support is temporarily unavailable. Please try again shortly.');
export const supportMissing = () => new SupportError(404, 'SUPPORT_NOT_FOUND', 'This support ticket is not available.');
export const supportConflict = () => new SupportError(409, 'SUPPORT_CONFLICT', 'This message ID has already been used. Refresh the conversation before sending.');
export const supportInvalid = () => new SupportError(400, 'SUPPORT_INVALID', 'Check the ticket details and try again.');
export const supportForbidden = () => new SupportError(403, 'SUPPORT_FORBIDDEN', 'This action is not available for your account.');
export const supportResolved = () => new SupportError(403, 'SUPPORT_TICKET_RESOLVED', 'This ticket is resolved. Create a new ticket for more help.');

/** Private persistence data. Never serialize these records directly into an API response. */
export type SupportTicketRecord = Omit<SupportTicket, 'unreadCount'> & {
  ownerId: string; ownerLabel: string; ownerEmail: string;
  customerReadSequence: number; customerReadAt: string | null; adminReadSequence: number;
  firstViewedAt?: string | null; firstReplyAt?: string | null;
};
export type SupportMessageRecord = SupportMessage & { clientMessageId: string; senderId: string; imageHash?: string };

export function checkedCreate(actor: SupportActor, input: SupportCreateInput, image?: SupportImageRecord) {
  if (actor.admin) throw supportForbidden();
  const parsed = supportCreateSchema.safeParse(input);
  if (!parsed.success || (!parsed.data.message && !image)) throw supportInvalid();
  return parsed.data;
}
export function checkedReply(actor: SupportActor, input: SupportReplyInput, image?: SupportImageRecord): SupportReplyInput {
  if (actor.admin && image) throw supportForbidden();
  const parsed = supportReplySchema.safeParse(input);
  if (!parsed.success || (!parsed.data.message && !image)) throw supportInvalid();
  return parsed.data;
}
export function checkedList(input: SupportListQuery): SupportListQuery {
  const parsed = supportListSchema.safeParse(input);
  if (!parsed.success) throw supportInvalid();
  return parsed.data;
}
export function checkedWelcomeList(actor: SupportActor, input: SupportWelcomeQuery): SupportWelcomeQuery {
  if (!actor.admin) throw supportForbidden();
  const parsed = supportWelcomeListSchema.safeParse(input);
  if (!parsed.success) throw supportInvalid();
  return parsed.data;
}
export function checkTicketId(id: string) {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)) throw supportMissing();
}
export function checkBefore(before?: number) {
  if (before !== undefined && (!Number.isSafeInteger(before) || before < 1)) throw supportInvalid();
}
export function checkSequence(sequence: number) {
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw supportInvalid();
}
export function checkStatus(actor: SupportActor, status: SupportStatus) {
  if (!actor.admin) throw supportForbidden();
  if (status !== 'open' && status !== 'resolved') throw supportInvalid();
}
export function newSupportTicket(actor: SupportActor, input: SupportCreateInput): SupportTicketRecord {
  const now = new Date().toISOString();
  return {
    id: input.clientTicketId, ownerId: actor.id, ownerLabel: actor.label, ownerEmail: actor.email,
    subject: input.subject, preferredLanguage: input.preferredLanguage ?? 'en', status: 'open', createdAt: now, updatedAt: now,
    lastMessage: '', lastSender: 'customer', messageCount: 0,
    customerReadSequence: 0, customerReadAt: null, adminReadSequence: 0,
  };
}
export function newSupportMessage(actor: SupportActor, ticket: SupportTicketRecord, input: SupportReplyInput, image?: SupportImageRecord): SupportMessageRecord {
  const id = randomUUID();
  return {
    id, ticketId: ticket.id, sequence: ticket.messageCount + 1,
    sender: actor.admin ? 'admin' : 'customer', senderId: actor.id,
    clientMessageId: input.clientMessageId, body: input.message, createdAt: new Date().toISOString(),
    ...(image ? { imageHash: image.sha256, image: {
      url: `/portal/v1/support/tickets/${ticket.id}/messages/${id}/image`, mimeType: image.mimeType,
      width: image.width, height: image.height, byteSize: image.byteSize,
    } } : {}),
  };
}
export function applySupportMessage(ticket: SupportTicketRecord, message: SupportMessageRecord) {
  ticket.messageCount = message.sequence; ticket.updatedAt = message.createdAt;
  ticket.lastMessage = message.body.slice(0, 240) || (message.image ? 'Image' : ''); ticket.lastSender = message.sender;
  if (ticket.kind === 'welcome' && message.sender === 'customer' && !ticket.firstReplyAt) ticket.firstReplyAt = message.createdAt;
}
export function newSupportWelcome(actor: SupportActor) {
  if (actor.admin) throw supportForbidden();
  const input = {
    clientTicketId: randomUUID(), clientMessageId: randomUUID(), subject: 'Welcome to kineticRouter',
    message: 'Welcome to kineticRouter! If you have any questions or issues with the API, reach out to us here—we’re happy to help. Reply to this message whenever you need assistance. Feel free to follow us on our social channels for updates.',
  };
  const ticket = newSupportTicket(actor, input);
  ticket.kind = 'welcome'; ticket.firstViewedAt = null; ticket.firstReplyAt = null;
  const message = newSupportMessage({ id: 'kinetic-support-welcome', label: 'kineticRouter Support', email: '', admin: true }, ticket, input);
  message.kind = 'welcome'; ticket.createdAt = message.createdAt;
  applySupportMessage(ticket, message);
  return { ticket, message };
}
export function supportWelcomeRecipient(ticket: SupportTicketRecord): SupportWelcomeRecipient {
  return { ticketId: ticket.id, ownerId: ticket.ownerId, ownerLabel: ticket.ownerLabel, ownerEmail: ticket.ownerEmail,
    sentAt: ticket.createdAt, firstViewedAt: ticket.firstViewedAt ?? null, firstReplyAt: ticket.firstReplyAt ?? null };
}
export function checkSupportReplay(actor: SupportActor, message: SupportMessageRecord, input: SupportReplyInput, image?: SupportImageRecord) {
  if (message.senderId !== actor.id || message.sender !== (actor.admin ? 'admin' : 'customer')
    || message.body !== input.message || message.imageHash !== image?.sha256) throw supportConflict();
}
export function publicSupportMessage(message: SupportMessageRecord): SupportMessage {
  return { id: message.id, ticketId: message.ticketId, sequence: message.sequence, sender: message.sender, body: message.body, createdAt: message.createdAt, ...(message.image ? { image: { ...message.image } } : {}), ...(message.kind === 'welcome' ? { kind: 'welcome' as const } : {}) };
}
export function publicSupportTicket(actor: SupportActor, ticket: SupportTicketRecord, unreadCount: number): SupportTicket {
  return {
    id: ticket.id, subject: ticket.subject, preferredLanguage: ticket.preferredLanguage ?? 'en', status: ticket.status, createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt, lastMessage: ticket.lastMessage, lastSender: ticket.lastSender,
    messageCount: ticket.messageCount, unreadCount,
    ...(ticket.kind === 'welcome' ? { kind: 'welcome' as const } : {}),
    ...(actor.admin ? {
      ownerId: ticket.ownerId, ownerLabel: ticket.ownerLabel, ownerEmail: ticket.ownerEmail,
      customerReadSequence: ticket.customerReadSequence, customerReadAt: ticket.customerReadAt,
    } : {}),
  };
}
export function advanceSupportRead(actor: SupportActor, ticket: SupportTicketRecord, sequence: number): boolean {
  const field = actor.admin ? 'adminReadSequence' : 'customerReadSequence';
  const next = Math.min(sequence, ticket.messageCount);
  if (next <= ticket[field]) return false;
  ticket[field] = next;
  if (!actor.admin) ticket.customerReadAt = new Date().toISOString();
  return true;
}

/** Test fixture only: production and local development require durable PostgreSQL storage. */
export class MemorySupportStore implements SupportStore {
  readonly configured = true;
  private tickets = new Map<string, SupportTicketRecord>();
  private messages = new Map<string, SupportMessageRecord[]>();
  private images = new Map<string, SupportImageRecord>();
  private get(actor: SupportActor, id: string) {
    checkTicketId(id);
    const ticket = this.tickets.get(id);
    if (!ticket || (!actor.admin && ticket.ownerId !== actor.id)) throw supportMissing();
    return ticket;
  }
  private dto(actor: SupportActor, ticket: SupportTicketRecord) {
    const cursor = actor.admin ? ticket.adminReadSequence : ticket.customerReadSequence;
    const sender = actor.admin ? 'customer' : 'admin';
    const unread = this.messages.get(ticket.id)!.filter(message => message.sequence > cursor && message.sender === sender).length;
    return publicSupportTicket(actor, ticket, unread);
  }
  async list(actor: SupportActor, input: SupportListQuery) {
    const query = checkedList(input);
    const visible = [...this.tickets.values()].filter(ticket => actor.admin || ticket.ownerId === actor.id);
    const matching = visible.filter(ticket => (!actor.admin || ticket.kind !== 'welcome' || Boolean(ticket.firstReplyAt))
      && (query.status === 'all' || ticket.status === query.status)
      && `${ticket.subject} ${actor.admin ? `${ticket.ownerLabel} ${ticket.ownerEmail} ${ticket.ownerId}` : ''}`.toLowerCase().includes(query.search.toLowerCase()))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
    return {
      items: matching.slice((query.page - 1) * 30, query.page * 30).map(ticket => this.dto(actor, ticket)),
      total: matching.length, unreadCount: visible.reduce((sum, ticket) => sum + this.dto(actor, ticket).unreadCount, 0),
    };
  }
  async detail(actor: SupportActor, id: string, before?: number) {
    checkBefore(before);
    const ticket = this.get(actor, id);
    const messages = this.messages.get(id)!.filter(message => before === undefined || message.sequence < before).slice(-50).map(publicSupportMessage);
    return { ticket: this.dto(actor, ticket), messages, nextBefore: messages[0] && messages[0].sequence > 1 ? messages[0].sequence : null };
  }
  async create(actor: SupportActor, raw: SupportCreateInput, image?: SupportImageRecord) {
    const input = checkedCreate(actor, raw, image);
    if (this.tickets.has(input.clientTicketId)) {
      const ticket = this.get(actor, input.clientTicketId), first = this.messages.get(ticket.id)![0]!;
      if (ticket.subject !== input.subject || (ticket.preferredLanguage ?? 'en') !== input.preferredLanguage
        || first.clientMessageId !== input.clientMessageId) throw supportConflict();
      checkSupportReplay(actor, first, input, image);
      return { ticket: this.dto(actor, ticket), message: publicSupportMessage(first), created: false, ownerId: ticket.ownerId };
    }
    const ticket = newSupportTicket(actor, input), message = newSupportMessage(actor, ticket, input, image);
    applySupportMessage(ticket, message); this.tickets.set(ticket.id, ticket); this.messages.set(ticket.id, [message]);
    if (image) this.images.set(message.id, { ...image, bytes: Buffer.from(image.bytes) });
    return { ticket: this.dto(actor, ticket), message: publicSupportMessage(message), created: true, ownerId: ticket.ownerId };
  }
  async ensureWelcome(actor: SupportActor) {
    if (actor.admin) throw supportForbidden();
    const existing = [...this.tickets.values()].find(ticket => ticket.ownerId === actor.id && ticket.kind === 'welcome');
    if (existing) return { ticket: this.dto(actor, existing), message: publicSupportMessage(this.messages.get(existing.id)![0]!), created: false, ownerId: actor.id };
    const { ticket, message } = newSupportWelcome(actor);
    this.tickets.set(ticket.id, ticket); this.messages.set(ticket.id, [message]);
    return { ticket: this.dto(actor, ticket), message: publicSupportMessage(message), created: true, ownerId: actor.id };
  }
  async viewWelcome(actor: SupportActor) {
    if (actor.admin) throw supportForbidden();
    const ticket = [...this.tickets.values()].find(ticket => ticket.ownerId === actor.id && ticket.kind === 'welcome');
    if (!ticket) throw supportMissing();
    const changed = !ticket.firstViewedAt;
    if (changed) ticket.firstViewedAt = new Date().toISOString();
    return { ticketId: ticket.id, changed };
  }
  async welcomeList(actor: SupportActor, input: SupportWelcomeQuery) {
    const query = checkedWelcomeList(actor, input);
    const matching = [...this.tickets.values()].filter(ticket => ticket.kind === 'welcome'
      && `${ticket.ownerLabel} ${ticket.ownerEmail} ${ticket.ownerId}`.toLowerCase().includes(query.search.toLowerCase()))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return { items: matching.slice((query.page - 1) * 30, query.page * 30).map(supportWelcomeRecipient), total: matching.length };
  }
  async reply(actor: SupportActor, id: string, raw: SupportReplyInput, image?: SupportImageRecord) {
    const input = checkedReply(actor, raw, image), ticket = this.get(actor, id), messages = this.messages.get(id)!;
    const existing = messages.find(message => message.clientMessageId === input.clientMessageId);
    if (existing) {
      checkSupportReplay(actor, existing, input, image);
      return { ticket: this.dto(actor, ticket), message: publicSupportMessage(existing), created: false, ownerId: ticket.ownerId };
    }
    if (!actor.admin && ticket.status === 'resolved') throw supportResolved();
    const message = newSupportMessage(actor, ticket, input, image);
    messages.push(message); applySupportMessage(ticket, message);
    if (image) this.images.set(message.id, { ...image, bytes: Buffer.from(image.bytes) });
    return { ticket: this.dto(actor, ticket), message: publicSupportMessage(message), created: true, ownerId: ticket.ownerId };
  }
  async image(actor: SupportActor, id: string, messageId: string) {
    this.get(actor, id); checkTicketId(messageId);
    const image = this.messages.get(id)!.some(message => message.id === messageId) ? this.images.get(messageId) : undefined;
    if (!image) throw supportMissing();
    return { ...image, bytes: Buffer.from(image.bytes) };
  }
  async read(actor: SupportActor, id: string, sequence: number) {
    checkSequence(sequence);
    const ticket = this.get(actor, id);
    return { ownerId: ticket.ownerId, changed: advanceSupportRead(actor, ticket, sequence) };
  }
  async setStatus(actor: SupportActor, id: string, status: SupportStatus) {
    checkStatus(actor, status);
    const ticket = this.get(actor, id);
    const changed = ticket.status !== status;
    if (changed) { ticket.status = status; ticket.updatedAt = new Date().toISOString(); }
    return { ownerId: ticket.ownerId, changed };
  }
  async health() {}
  async close() {}
}
