import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SUPPORT_LANGUAGE_CODES, type SupportCreateInput, type SupportListQuery } from '@kineticrouter/portal-contract';
import { MemorySupportStore, type SupportActor, type SupportStore } from '../apps/bff/src/support-store';
import { PostgresSupportStore, createSupportStore } from '../apps/bff/src/support-postgres';
import { prepareSupportImage } from '../apps/bff/src/support-images';

const customer: SupportActor = { id: 'customer-one', label: 'First Customer', email: 'one@example.test', admin: false };
const other: SupportActor = { id: 'customer-two', label: 'Second Customer', email: 'two@example.test', admin: false };
const admin: SupportActor = { id: 'admin', label: 'Support', email: 'support@example.test', admin: true };
const all: SupportListQuery = { page: 1, search: '', status: 'all' };
const input = (subject = 'Help with my account'): SupportCreateInput => ({ clientTicketId: randomUUID(), clientMessageId: randomUUID(), subject, message: 'I need some help.' });
const reply = (message = 'We can help.') => ({ clientMessageId: randomUUID(), message });
const database = process.env.TEST_SUPPORT_DATABASE_URL || process.env.TEST_ANALYTICS_DATABASE_URL;
async function image(color = '#123456') {
  const bytes = await sharp({ create: { width: 20, height: 12, channels: 3, background: color } }).png().toBuffer();
  return prepareSupportImage(new File([new Uint8Array(bytes)], 'screenshot.png', { type: 'image/png' }));
}

for (const kind of ['memory', 'postgres'] as const) {
  describe.skipIf(kind === 'postgres' && !database)(`${kind} support persistence`, () => {
    let store: SupportStore;
    let root: Pool | undefined;
    let schema: string | undefined;
    beforeEach(async () => {
      if (kind === 'memory') store = new MemorySupportStore();
      else {
        schema = `kr_support_test_${randomUUID().replaceAll('-', '')}`;
        root = new Pool({ connectionString: database!, connectionTimeoutMillis: 3000 });
        await root.query(`CREATE SCHEMA ${schema}`);
        store = new PostgresSupportStore(database!, { searchPath: schema });
        await store.health();
      }
    }, 20_000);
    afterEach(async () => {
      await store?.close();
      if (root) {
        if (!schema || !/^kr_support_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe test schema');
        await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await root.end(); root = undefined;
      }
    });

    it('isolates customers and exposes only explicit public fields', async () => {
      const created = await store.create(customer, input());
      expect(created.created).toBe(true);
      expect(created.ticket).toMatchObject({ status: 'open', messageCount: 1, unreadCount: 0 });
      expect(Object.keys(created.ticket).sort()).toEqual(['id', 'subject', 'preferredLanguage', 'status', 'createdAt', 'updatedAt', 'lastMessage', 'lastSender', 'messageCount', 'unreadCount'].sort());
      expect(Object.keys(created.message).sort()).toEqual(['id', 'ticketId', 'sequence', 'sender', 'body', 'createdAt'].sort());
      const id = created.ticket.id;
      await expect(store.detail(other, id)).rejects.toMatchObject({ status: 404 });
      await expect(store.reply(other, id, reply())).rejects.toMatchObject({ status: 404 });
      await expect(store.read(other, id, 1)).rejects.toMatchObject({ status: 404 });
      await expect(store.detail(customer, randomUUID())).rejects.toMatchObject({ status: 404 });
      await expect(store.detail(customer, 'invalid')).rejects.toMatchObject({ status: 404 });
      expect(await store.list(other, all)).toEqual({ items: [], total: 0, unreadCount: 0 });
      const inspection = await store.detail(admin, id);
      expect(inspection.ticket).toMatchObject({ ownerId: customer.id, ownerLabel: customer.label, ownerEmail: customer.email, customerReadSequence: 0, unreadCount: 1 });
      expect(inspection.ticket).not.toHaveProperty('adminReadSequence');
    });

    it('creates one Support welcome per account across concurrent requests and hides untouched welcomes from the admin inbox', async () => {
      const regular = await store.create(customer, input());
      const results = await Promise.all(Array.from({ length: 8 }, () => store.ensureWelcome(customer)));
      expect(results.filter(result => result.created)).toHaveLength(1);
      expect(new Set(results.map(result => result.ticket.id)).size).toBe(1);
      expect(new Set(results.map(result => result.message.id)).size).toBe(1);
      const welcome = results[0]!;
      expect(welcome.ticket).toMatchObject({ subject: 'Welcome to kineticRouter', kind: 'welcome', status: 'open', preferredLanguage: 'en', unreadCount: 1, messageCount: 1 });
      expect(welcome.message).toMatchObject({ kind: 'welcome', sender: 'admin', sequence: 1, createdAt: welcome.ticket.createdAt });
      expect(welcome.message.body).toBe('Welcome to kineticRouter! If you have any questions or issues with the API, reach out to us here—we’re happy to help. Reply to this message whenever you need assistance. Feel free to follow us on our social channels for updates.');
      expect(welcome.ticket).not.toHaveProperty('firstViewedAt');
      expect(welcome.ticket).not.toHaveProperty('firstReplyAt');
      const ownList = await store.list(customer, all);
      expect(ownList.items.map(ticket => ticket.id)).toContain(welcome.ticket.id);
      expect(ownList.unreadCount).toBe(1);
      const inbox = await store.list(admin, all);
      expect(inbox.items.map(ticket => ticket.id)).toEqual([regular.ticket.id]);
      expect(inbox.total).toBe(1);
      expect(inbox.unreadCount).toBe(1);
      expect((await store.list(admin, { ...all, search: 'Welcome' })).total).toBe(0);
      const report = await store.welcomeList(admin, { page: 1, search: '' });
      expect(report).toEqual({ items: [{ ticketId: welcome.ticket.id, ownerId: customer.id, ownerLabel: customer.label, ownerEmail: customer.email, sentAt: welcome.message.createdAt, firstViewedAt: null, firstReplyAt: null }], total: 1 });
      await expect(store.ensureWelcome(admin)).rejects.toMatchObject({ status: 403 });
      await expect(store.welcomeList(customer, { page: 1, search: '' })).rejects.toMatchObject({ status: 403 });
      await expect(store.detail(other, welcome.ticket.id)).rejects.toMatchObject({ status: 404 });
      expect((await store.ensureWelcome(other)).ticket.id).not.toBe(welcome.ticket.id);
    });

    it('records first welcome viewing only from its explicit acknowledgment without changing activity or read cursors', async () => {
      const welcome = await store.ensureWelcome(customer);
      await store.read(customer, welcome.ticket.id, 1);
      expect((await store.welcomeList(admin, { page: 1, search: '' })).items[0]?.firstViewedAt).toBeNull();
      const before = await store.detail(customer, welcome.ticket.id), adminBefore = await store.detail(admin, welcome.ticket.id);
      const results = await Promise.all(Array.from({ length: 8 }, () => store.viewWelcome(customer)));
      expect(results.filter(result => result.changed)).toHaveLength(1);
      expect(results.every(result => result.ticketId === welcome.ticket.id)).toBe(true);
      const firstViewedAt = (await store.welcomeList(admin, { page: 1, search: '' })).items[0]?.firstViewedAt;
      expect(firstViewedAt).toEqual(expect.any(String));
      expect(await store.detail(customer, welcome.ticket.id)).toEqual(before);
      expect(await store.detail(admin, welcome.ticket.id)).toEqual(adminBefore);
      expect((await store.list(admin, all)).total).toBe(0);
      expect(await store.viewWelcome(customer)).toEqual({ ticketId: welcome.ticket.id, changed: false });
      await store.reply(admin, welcome.ticket.id, reply());
      await store.read(customer, welcome.ticket.id, 2);
      expect((await store.welcomeList(admin, { page: 1, search: '' })).items[0]?.firstViewedAt).toBe(firstViewedAt);
      await expect(store.viewWelcome(other)).rejects.toMatchObject({ status: 404 });
      await expect(store.viewWelcome(admin)).rejects.toMatchObject({ status: 403 });
    });

    it('moves a welcome into the normal inbox only on the first customer reply and retains its first reply time', async () => {
      const welcome = await store.ensureWelcome(customer);
      await store.reply(admin, welcome.ticket.id, reply());
      expect((await store.list(admin, all)).total).toBe(0);
      const attachment = await image(), firstRequest = reply('');
      const first = await store.reply(customer, welcome.ticket.id, firstRequest, attachment);
      const inbox = await store.list(admin, all);
      expect(inbox).toMatchObject({ total: 1, unreadCount: 1 });
      expect(inbox.items[0]?.id).toBe(welcome.ticket.id);
      expect(first.message).not.toHaveProperty('kind');
      const report = (await store.welcomeList(admin, { page: 1, search: '' })).items[0]!;
      expect(report).toMatchObject({ firstViewedAt: null, firstReplyAt: first.message.createdAt });
      expect((await store.reply(customer, welcome.ticket.id, firstRequest, attachment)).created).toBe(false);
      await store.reply(customer, welcome.ticket.id, reply('Another question'));
      expect((await store.welcomeList(admin, { page: 1, search: '' })).items[0]).toEqual(report);
      await store.setStatus(admin, welcome.ticket.id, 'resolved');
      expect((await store.ensureWelcome(customer)).created).toBe(false);
      expect((await store.ensureWelcome(customer)).ticket.status).toBe('resolved');
      expect((await store.welcomeList(admin, { page: 1, search: '' })).items[0]).toEqual(report);
    });

    it('paginates and searches the welcome report independently of replies, viewing, and normal tickets', async () => {
      const people = Array.from({ length: 31 }, (_, index) => ({ ...customer, id: `recipient-${index}`, label: `Recipient ${index}`, email: `recipient-${index}@example.test` }));
      const welcomes = await Promise.all(people.map(person => store.ensureWelcome(person)));
      await store.create(customer, input());
      const page1 = await store.welcomeList(admin, { page: 1, search: '' }), page2 = await store.welcomeList(admin, { page: 2, search: '' });
      expect(page1.items).toHaveLength(30); expect(page2.items).toHaveLength(1);
      expect(page1.total).toBe(31); expect(page2.total).toBe(31);
      expect(new Set([...page1.items, ...page2.items].map(item => item.ticketId)).size).toBe(31);
      const person = people[0]!, welcome = welcomes[0]!;
      await store.viewWelcome(person); await store.reply(person, welcome.ticket.id, reply('Hello'));
      expect((await store.welcomeList(admin, { page: 1, search: '' })).items.map(item => item.ticketId)).toEqual(page1.items.map(item => item.ticketId));
      const matching = await store.welcomeList(admin, { page: 1, search: 'RECIPIENT-0@EXAMPLE.TEST' });
      expect(matching.total).toBe(1); expect(matching.items[0]?.ticketId).toBe(welcome.ticket.id);
      expect(await store.welcomeList(admin, { page: 3, search: '' })).toEqual({ items: [], total: 31 });
      await expect(store.welcomeList(admin, { page: 0, search: '' })).rejects.toMatchObject({ status: 400 });
    }, 20_000);

    it.skipIf(kind !== 'postgres')('persists the once-per-account welcome and its tracking through a restart', async () => {
      const welcome = await store.ensureWelcome(customer);
      await store.viewWelcome(customer); await store.reply(customer, welcome.ticket.id, reply('Hello'));
      await store.setStatus(admin, welcome.ticket.id, 'resolved');
      const report = await store.welcomeList(admin, { page: 1, search: '' });
      await store.close(); store = new PostgresSupportStore(database!, { searchPath: schema });
      const existing = await store.ensureWelcome(customer);
      expect(existing.created).toBe(false);
      expect(existing.ticket).toMatchObject({ id: welcome.ticket.id, status: 'resolved', messageCount: 2 });
      expect(existing.message.id).toBe(welcome.message.id);
      expect(await store.welcomeList(admin, { page: 1, search: '' })).toEqual(report);
    });

    it.skipIf(kind !== 'postgres')('rolls back welcome uniqueness and the ticket when the first message cannot be saved', async () => {
      const pg = store as PostgresSupportStore;
      await pg.pool.query("CREATE FUNCTION reject_test_welcome() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test welcome failure'; END; $$");
      await pg.pool.query('CREATE TRIGGER reject_test_welcome BEFORE INSERT ON kr_support_messages FOR EACH ROW EXECUTE FUNCTION reject_test_welcome()');
      await expect(store.ensureWelcome(customer)).rejects.toMatchObject({ status: 503 });
      expect((await store.list(customer, all)).total).toBe(0);
      expect((await store.welcomeList(admin, { page: 1, search: '' })).total).toBe(0);
      await pg.pool.query('DROP TRIGGER reject_test_welcome ON kr_support_messages');
      expect((await store.ensureWelcome(customer)).created).toBe(true);
    });

    it('keeps administrator reads invisible and customer receipts monotonic and bounded', async () => {
      const { ticket } = await store.create(customer, input());
      const before = await store.detail(customer, ticket.id);
      expect(await store.read(admin, ticket.id, 1)).toEqual({ ownerId: customer.id, changed: true });
      expect(await store.detail(customer, ticket.id)).toEqual(before);
      expect((await store.detail(admin, ticket.id)).ticket.unreadCount).toBe(0);
      await store.reply(admin, ticket.id, reply());
      expect((await store.detail(customer, ticket.id)).ticket.unreadCount).toBe(1);
      const activity = (await store.detail(admin, ticket.id)).ticket.updatedAt;
      expect(await store.read(customer, ticket.id, 99999)).toEqual({ ownerId: customer.id, changed: true });
      expect(await store.read(customer, ticket.id, 1)).toEqual({ ownerId: customer.id, changed: false });
      expect((await store.detail(admin, ticket.id)).ticket).toMatchObject({ customerReadSequence: 2, updatedAt: activity });
      expect((await store.detail(admin, ticket.id)).ticket.customerReadAt).toEqual(expect.any(String));
      await store.reply(admin, ticket.id, reply('A second response.'));
      expect((await store.detail(customer, ticket.id)).ticket.unreadCount).toBe(1);
      await expect(store.read(customer, ticket.id, -1)).rejects.toMatchObject({ status: 400 });
      await expect(store.read(customer, ticket.id, 1.5)).rejects.toMatchObject({ status: 400 });
    });

    it('deduplicates concurrent creates and replies and rejects changed retry payloads', async () => {
      const request = input();
      const created = await Promise.all(Array.from({ length: 8 }, () => store.create(customer, request)));
      expect(created.filter(result => result.created)).toHaveLength(1);
      expect(new Set(created.map(result => result.message.id)).size).toBe(1);
      await expect(store.create(customer, { ...request, subject: 'Changed subject' })).rejects.toMatchObject({ status: 409 });
      await expect(store.create(customer, { ...request, message: 'Changed message' })).rejects.toMatchObject({ status: 409 });
      await expect(store.create(customer, { ...request, clientMessageId: randomUUID() })).rejects.toMatchObject({ status: 409 });
      await expect(store.create(other, request)).rejects.toMatchObject({ status: 404 });
      const next = reply();
      const replies = await Promise.all(Array.from({ length: 8 }, () => store.reply(admin, request.clientTicketId, next)));
      expect(replies.filter(result => result.created)).toHaveLength(1);
      expect(new Set(replies.map(result => result.message.id)).size).toBe(1);
      await expect(store.reply(admin, request.clientTicketId, { ...next, message: 'Changed' })).rejects.toMatchObject({ status: 409 });
      await expect(store.reply(customer, request.clientTicketId, next)).rejects.toMatchObject({ status: 409 });
      const detail = await store.detail(customer, request.clientTicketId);
      expect(detail.messages.map(message => message.sequence)).toEqual([1, 2]);
      expect(detail.ticket.messageCount).toBe(2);
    });

    it('stores supported reply languages, defaults legacy creates to English, and rejects changed-language retries', async () => {
      const request = input();
      const english = await store.create(customer, request);
      expect(english.ticket.preferredLanguage).toBe('en');
      expect((await store.create(customer, { ...request, preferredLanguage: 'en' })).created).toBe(false);
      await expect(store.create(customer, { ...request, preferredLanguage: 'de' })).rejects.toMatchObject({ status: 409 });
      for (const preferredLanguage of SUPPORT_LANGUAGE_CODES) {
        const chosen = { ...input(), preferredLanguage };
        const created = await store.create(customer, chosen);
        expect(created.ticket.preferredLanguage).toBe(preferredLanguage);
        expect((await store.detail(admin, created.ticket.id)).ticket.preferredLanguage).toBe(preferredLanguage);
        expect((await store.list(customer, all)).items.find(ticket => ticket.id === created.ticket.id)?.preferredLanguage).toBe(preferredLanguage);
        expect((await store.create(customer, chosen)).created).toBe(false);
      }
      for (const preferredLanguage of ['', 'EN', 'en-US', 'unknown', null]) {
        await expect(store.create(customer, { ...input(), preferredLanguage } as unknown as SupportCreateInput)).rejects.toMatchObject({ status: 400 });
      }
    });

    it('serializes simultaneous unique messages without gaps and pages older messages', async () => {
      const { ticket } = await store.create(customer, input());
      const firstBatch = Array.from({ length: 30 }, (_, index) => reply(`Response ${index}`));
      const secondBatch = Array.from({ length: 24 }, (_, index) => reply(`Later response ${index}`));
      await Promise.all(firstBatch.map(message => store.reply(admin, ticket.id, message)));
      await Promise.all(secondBatch.map(message => store.reply(admin, ticket.id, message)));
      const newest = await store.detail(customer, ticket.id);
      expect(newest.ticket.messageCount).toBe(55);
      expect(newest.messages.map(message => message.sequence)).toEqual(Array.from({ length: 50 }, (_, index) => index + 6));
      expect(newest.nextBefore).toBe(6);
      const older = await store.detail(customer, ticket.id, newest.nextBefore!);
      expect(older.messages.map(message => message.sequence)).toEqual([1, 2, 3, 4, 5]);
      expect(older.nextBefore).toBeNull();
      expect((await store.detail(customer, ticket.id, 1)).messages).toEqual([]);
      await expect(store.detail(customer, ticket.id, -1)).rejects.toMatchObject({ status: 400 });
    }, 20_000);

    it('restricts status changes to admins and preserves admin replies and reopening', async () => {
      await expect(store.create(admin, input())).rejects.toMatchObject({ status: 403 });
      const request = input(), { ticket } = await store.create(customer, request);
      await expect(store.setStatus(customer, ticket.id, 'resolved')).rejects.toMatchObject({ status: 403 });
      await store.setStatus(admin, ticket.id, 'resolved');
      await store.create(customer, request);
      expect((await store.detail(customer, ticket.id)).ticket.status).toBe('resolved');
      await store.reply(admin, ticket.id, reply());
      expect((await store.detail(customer, ticket.id)).ticket.status).toBe('resolved');
      for (const person of [customer, other]) {
        await expect(store.setStatus(person, ticket.id, 'open')).rejects.toMatchObject({ status: 403 });
        await expect(store.setStatus(person, randomUUID(), 'open')).rejects.toMatchObject({ status: 403 });
      }
      await expect(store.reply(customer, ticket.id, reply('Another question'))).rejects.toMatchObject({ status: 403, code: 'SUPPORT_TICKET_RESOLVED' });
      expect(await store.setStatus(admin, ticket.id, 'open')).toEqual({ ownerId: customer.id, changed: true });
      expect(await store.setStatus(admin, ticket.id, 'open')).toEqual({ ownerId: customer.id, changed: false });
      await store.reply({ ...customer, label: 'Updated label', email: 'updated@example.test' }, ticket.id, reply('Another question'));
      expect((await store.detail(admin, ticket.id)).ticket).toMatchObject({ status: 'open', ownerLabel: customer.label, ownerEmail: customer.email });
    });

    it('keeps resolved history readable and rejects new customer text/images without changing messages, receipts, or unread counts', async () => {
      const attachment = await image(), request = { ...input(), preferredLanguage: 'vi' as const };
      const { ticket, message: first } = await store.create(customer, request, attachment);
      const textRequest = reply('Sent before resolution'), imageRequest = reply('');
      const text = await store.reply(customer, ticket.id, textRequest);
      const picture = await store.reply(customer, ticket.id, imageRequest, attachment);
      await store.reply(admin, ticket.id, reply());
      await store.read(admin, ticket.id, 3); await store.read(customer, ticket.id, 4);
      expect(await store.setStatus(admin, ticket.id, 'resolved')).toEqual({ ownerId: customer.id, changed: true });
      const before = await store.detail(admin, ticket.id), customerBefore = await store.detail(customer, ticket.id);
      const expected = { status: 403, code: 'SUPPORT_TICKET_RESOLVED', message: 'This ticket is resolved. Create a new ticket for more help.' };
      await expect(store.reply(customer, ticket.id, reply('New message'))).rejects.toMatchObject(expected);
      await expect(store.reply(customer, ticket.id, reply(''), attachment)).rejects.toMatchObject(expected);
      await expect(store.reply(other, ticket.id, reply('New message'))).rejects.toMatchObject({ status: 404 });
      await expect(store.reply(other, ticket.id, reply(''), attachment)).rejects.toMatchObject({ status: 404 });
      await expect(store.reply(customer, randomUUID(), reply('New message'))).rejects.toMatchObject({ status: 404 });
      expect(await store.image(customer, ticket.id, picture.message.id)).toEqual(attachment);
      expect(await store.create(customer, request, attachment)).toMatchObject({ created: false, message: { id: first.id }, ticket: { status: 'resolved' } });
      expect(await store.reply(customer, ticket.id, textRequest)).toMatchObject({ created: false, message: { id: text.message.id }, ticket: { status: 'resolved' } });
      expect(await store.reply(customer, ticket.id, imageRequest, attachment)).toMatchObject({ created: false, message: { id: picture.message.id }, ticket: { status: 'resolved' } });
      await expect(store.reply(customer, ticket.id, { ...textRequest, message: 'Changed retry' })).rejects.toMatchObject({ status: 409 });
      await expect(store.reply(customer, ticket.id, imageRequest, await image('#abcdef'))).rejects.toMatchObject({ status: 409 });
      expect(await store.detail(admin, ticket.id)).toEqual(before);
      expect(await store.detail(customer, ticket.id)).toEqual(customerBefore);
      if (kind === 'postgres') {
        expect(Number((await (store as PostgresSupportStore).pool.query('SELECT count(*) FROM kr_support_images')).rows[0].count)).toBe(2);
      }
    });

    it.skipIf(kind !== 'postgres')('serializes resolution against concurrent customer text and image replies without reopening', async () => {
      const attachment = await image();
      for (let index = 0; index < 6; index++) {
        const { ticket } = await store.create(customer, input());
        const attemptedImage = index % 2 === 0 ? attachment : undefined;
        const [resolution, response] = await Promise.allSettled([
          store.setStatus(admin, ticket.id, 'resolved'),
          store.reply(customer, ticket.id, reply(attemptedImage ? '' : 'Concurrent message'), attemptedImage),
        ]);
        expect(resolution.status).toBe('fulfilled');
        if (response.status === 'fulfilled') expect(response.value.ticket.status).toBe('open');
        else expect(response.reason).toMatchObject({ status: 403, code: 'SUPPORT_TICKET_RESOLVED' });
        const detail = await store.detail(admin, ticket.id);
        expect(detail.ticket.status).toBe('resolved');
        expect(detail.ticket.messageCount).toBe(response.status === 'fulfilled' ? 2 : 1);
        const images = await (store as PostgresSupportStore).pool.query('SELECT count(*) FROM kr_support_images i JOIN kr_support_messages m ON m.id=i.message_id WHERE m.ticket_id=$1', [ticket.id]);
        expect(Number(images.rows[0].count)).toBe(response.status === 'fulfilled' && attemptedImage ? 1 : 0);
        await expect(store.reply(customer, ticket.id, reply('After resolution'))).rejects.toMatchObject({ status: 403, code: 'SUPPORT_TICKET_RESOLVED' });
      }
    }, 20_000);

    it('keeps global unread totals independent of search, pagination, and status', async () => {
      const tickets = await Promise.all(Array.from({ length: 31 }, (_, index) => store.create(customer, input(`Question ${index}`))));
      await store.create(other, input('Another customer'));
      await store.setStatus(admin, tickets[0]!.ticket.id, 'resolved');
      const page = await store.list(admin, { ...all, status: 'open' });
      expect(page.items).toHaveLength(30); expect(page.total).toBe(31); expect(page.unreadCount).toBe(32);
      expect((await store.list(admin, { ...all, page: 2, status: 'open' })).items).toHaveLength(1);
      const empty = await store.list(admin, { ...all, page: 100, search: 'First Customer' });
      expect(empty).toEqual({ items: [], total: 31, unreadCount: 32 });
      expect((await store.list(customer, { ...all, search: 'First Customer' })).total).toBe(0);
      expect((await store.list(customer, all)).total).toBe(31);
      await store.read(admin, tickets[0]!.ticket.id, 1);
      expect((await store.list(admin, { ...all, search: 'No matching tickets' })).unreadCount).toBe(31);
      await store.reply(admin, tickets[1]!.ticket.id, reply());
      expect((await store.list(customer, { ...all, status: 'resolved' })).unreadCount).toBe(1);
      expect((await store.list(other, all)).unreadCount).toBe(0);
    }, 20_000);

    it('validates bounds and trims accepted input before storing it', async () => {
      await expect(store.create(customer, { ...input(), subject: 'x'.repeat(161) })).rejects.toMatchObject({ status: 400 });
      await expect(store.create(customer, { ...input(), message: 'x'.repeat(10001) })).rejects.toMatchObject({ status: 400 });
      await expect(store.create(customer, { ...input(), message: '   ' })).rejects.toMatchObject({ status: 400 });
      const { ticket, message } = await store.create(customer, { ...input(), subject: '  Subject  ', message: '  Hello  ' });
      expect(ticket.subject).toBe('Subject'); expect(message.body).toBe('Hello');
      await expect(store.reply(customer, ticket.id, reply('x'.repeat(10001)))).rejects.toMatchObject({ status: 400 });
      await expect(store.list(customer, { ...all, page: 0 })).rejects.toMatchObject({ status: 400 });
      expect((await store.detail(customer, ticket.id)).ticket.messageCount).toBe(1);
    });

    it('stores one private image per message and enforces ownership on every image read', async () => {
      const attachment = await image();
      const created = await store.create(customer, { ...input(), message: '' }, attachment);
      expect(created.ticket.lastMessage).toBe('Image');
      expect(created.message.image).toMatchObject({ mimeType: 'image/webp', width: 20, height: 12, byteSize: attachment.bytes.length });
      expect(created.message).not.toHaveProperty('imageHash');
      expect(JSON.stringify(created.message)).not.toContain('sha256');
      for (const person of [customer, admin]) expect(await store.image(person, created.ticket.id, created.message.id)).toEqual(attachment);
      await expect(store.image(other, created.ticket.id, created.message.id)).rejects.toMatchObject({ status: 404 });
      await expect(store.image(customer, randomUUID(), created.message.id)).rejects.toMatchObject({ status: 404 });
      await expect(store.image(customer, created.ticket.id, randomUUID())).rejects.toMatchObject({ status: 404 });
      await expect(store.reply(admin, created.ticket.id, reply(), attachment)).rejects.toMatchObject({ status: 403 });
      const text = await store.reply(admin, created.ticket.id, reply());
      await expect(store.image(customer, created.ticket.id, text.message.id)).rejects.toMatchObject({ status: 404 });
      const sent = await store.reply(customer, created.ticket.id, reply('Here is the next view.'), attachment);
      expect(sent.message).toMatchObject({ body: 'Here is the next view.', image: created.message.image && { mimeType: 'image/webp' } });
      expect(await store.image(admin, created.ticket.id, sent.message.id)).toEqual(attachment);
      if (kind === 'postgres') {
        const pg = store as PostgresSupportStore;
        const messages = await pg.pool.query('SELECT data FROM kr_support_messages');
        expect(messages.rows.every(row => !('bytes' in row.data) && !('bytes' in (row.data.image ?? {})))).toBe(true);
        expect(Number((await pg.pool.query('SELECT count(*) FROM kr_support_images')).rows[0].count)).toBe(2);
      }
    });

    it('includes image content in retry conflicts and serializes concurrent image sends', async () => {
      const attachment = await image(), changed = await image('#ff0000');
      const request = { ...input(), message: 'Screenshot attached' };
      const creates = await Promise.all(Array.from({ length: 6 }, () => store.create(customer, request, attachment)));
      expect(creates.filter(result => result.created)).toHaveLength(1);
      const { ticket } = creates[0]!;
      await expect(store.create(customer, request, changed)).rejects.toMatchObject({ status: 409 });
      await expect(store.create(customer, request)).rejects.toMatchObject({ status: 409 });
      const next = reply('');
      const replies = await Promise.all(Array.from({ length: 6 }, () => store.reply(customer, ticket.id, next, attachment)));
      expect(replies.filter(result => result.created)).toHaveLength(1);
      await expect(store.reply(customer, ticket.id, next, changed)).rejects.toMatchObject({ status: 409 });
      expect((await store.detail(customer, ticket.id)).messages.map(message => message.sequence)).toEqual([1, 2]);
      if (kind === 'postgres') expect(Number((await (store as PostgresSupportStore).pool.query('SELECT count(*) FROM kr_support_images')).rows[0].count)).toBe(2);
    });

    it.skipIf(kind !== 'postgres')('rolls back ticket, message, and image writes together when image persistence fails', async () => {
      const pg = store as PostgresSupportStore;
      await pg.pool.query(`CREATE FUNCTION reject_test_image() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test image failure'; END; $$`);
      const reject = () => pg.pool.query('CREATE TRIGGER reject_test_image BEFORE INSERT ON kr_support_images FOR EACH ROW EXECUTE FUNCTION reject_test_image()');
      const accept = () => pg.pool.query('DROP TRIGGER reject_test_image ON kr_support_images');
      const request = input(), attachment = await image();
      await reject();
      await expect(store.create(customer, request, attachment)).rejects.toMatchObject({ status: 503 });
      expect((await store.list(customer, all)).total).toBe(0);
      for (const table of ['kr_support_messages', 'kr_support_images']) expect(Number((await pg.pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count)).toBe(0);
      await accept();
      const created = await store.create(customer, request, attachment);
      await reject();
      await expect(store.reply(customer, created.ticket.id, reply(''), attachment)).rejects.toMatchObject({ status: 503 });
      expect((await store.detail(customer, created.ticket.id)).ticket.messageCount).toBe(1);
      for (const table of ['kr_support_messages', 'kr_support_images']) expect(Number((await pg.pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count)).toBe(1);
    });

    it.skipIf(kind !== 'postgres')('retains committed state and private cursors across a store restart', async () => {
      const attachment = await image();
      const { ticket, message } = await store.create(customer, { ...input(), preferredLanguage: 'ja' }, attachment);
      await store.reply(admin, ticket.id, reply()); await store.read(admin, ticket.id, 1); await store.read(customer, ticket.id, 2);
      const before = await store.detail(admin, ticket.id);
      await store.close(); store = new PostgresSupportStore(database!, { searchPath: schema });
      await store.health();
      expect(await store.detail(admin, ticket.id)).toEqual(before);
      expect(before.ticket.preferredLanguage).toBe('ja');
      expect(await store.image(customer, ticket.id, message.id)).toEqual(attachment);
      expect((await store.detail(customer, ticket.id)).ticket.unreadCount).toBe(0);
    });

    it.skipIf(kind !== 'postgres')('reads legacy ticket JSON as English and preserves create replay compatibility without a migration', async () => {
      const request = input(), { ticket } = await store.create(customer, request);
      await (store as PostgresSupportStore).pool.query("UPDATE kr_support_tickets SET data=data-'preferredLanguage' WHERE id=$1", [ticket.id]);
      await store.close(); store = new PostgresSupportStore(database!, { searchPath: schema });
      for (const person of [customer, admin]) {
        expect((await store.detail(person, ticket.id)).ticket.preferredLanguage).toBe('en');
        expect((await store.list(person, all)).items[0]?.preferredLanguage).toBe('en');
      }
      expect((await store.create(customer, request)).created).toBe(false);
      expect((await store.create(customer, { ...request, preferredLanguage: 'en' })).created).toBe(false);
      await expect(store.create(customer, { ...request, preferredLanguage: 'fr' })).rejects.toMatchObject({ status: 409 });
      const stored = await (store as PostgresSupportStore).pool.query('SELECT data FROM kr_support_tickets WHERE id=$1', [ticket.id]);
      expect(stored.rows[0].data).not.toHaveProperty('preferredLanguage');
    });
  });
}

describe('support configuration', () => {
  it('returns a clear unavailable error when no durable database is configured', async () => {
    const store = new PostgresSupportStore('');
    try {
      expect(store.configured).toBe(false);
      await expect(store.health()).rejects.toMatchObject({ status: 503, code: 'SUPPORT_UNAVAILABLE' });
      await expect(store.create(customer, input())).rejects.toMatchObject({ status: 503 });
    } finally { await store.close(); }
  });
  it('never implicitly selects ephemeral memory storage, including under tests', async () => {
    const store = createSupportStore();
    try { expect(store).toBeInstanceOf(PostgresSupportStore); } finally { await store.close(); }
  });
});
