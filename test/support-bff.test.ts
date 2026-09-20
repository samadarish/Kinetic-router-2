import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import * as redis from 'redis';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUPPORT_LANGUAGE_CODES, type SupportEvent } from '@kineticrouter/portal-contract';
import { readCapabilities, Sub2ApiClient } from '@kineticrouter/sub2api-client';
import { createApp } from '../apps/bff/src/app';
import { config } from '../apps/bff/src/config';
import { createSession, type PortalSession } from '../apps/bff/src/session-store';
import { MemorySupportStore } from '../apps/bff/src/support-store';
import { PostgresSupportStore } from '../apps/bff/src/support-postgres';
import { SupportRealtimeService } from '../apps/bff/src/support-realtime';

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.restoreAllMocks(); });
function headers(session: PortalSession) {
  return { cookie: `${config.sessionCookieName}=${session.id}`, origin: config.portalOrigin, 'x-csrf-token': session.csrfToken, 'content-type': 'application/json' };
}
function imageForm(fields: Record<string, string>, bytes: Uint8Array, mimeType = 'image/png') {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  form.set('image', new Blob([new Uint8Array(bytes)], { type: mimeType }), 'screenshot');
  return form;
}
const imageFields = (message = '') => ({ clientTicketId: randomUUID(), clientMessageId: randomUUID(), subject: 'Screenshot', message });
const screenshot = (color = '#123456', width = 40, height = 20) => sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
function noisyPixels(width: number, height: number) {
  const pixels = Buffer.alloc(width * height * 3);
  let state = 0x12345678;
  for (let index = 0; index < pixels.length; index++) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    pixels[index] = state & 255;
  }
  return pixels;
}
async function expectImagePixels(bytes: Buffer, samples: Array<{ x: number; y: number; rgba: number[] }>) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const { x, y, rgba } of samples) {
    const offset = (y * info.width + x) * info.channels;
    rgba.forEach((channel, index) => expect(Math.abs(data[offset + index]! - channel)).toBeLessThanOrEqual(index === 3 ? 0 : 8));
  }
}
function pngChunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}
async function animatedPng() {
  const png = await screenshot('#ff0000', 2, 2), imageData: Buffer[] = [];
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') imageData.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const animation = Buffer.alloc(8); animation.writeUInt32BE(2);
  const frame = (sequence: number) => {
    const data = Buffer.alloc(26);
    data.writeUInt32BE(sequence); data.writeUInt32BE(2, 4); data.writeUInt32BE(2, 8);
    data.writeUInt16BE(100, 20); data.writeUInt16BE(1000, 22);
    return pngChunk('fcTL', data);
  };
  const sequence = Buffer.alloc(4); sequence.writeUInt32BE(2);
  return Buffer.concat([png.subarray(0, 33), pngChunk('acTL', animation), frame(0), pngChunk('IDAT', Buffer.concat(imageData)),
    frame(1), pngChunk('fdAT', Buffer.concat([sequence, ...imageData])), pngChunk('IEND', Buffer.alloc(0))]);
}
async function fixture(options: { unconfigured?: boolean; now?: () => number } = {}) {
  const profile = { id: 3, username: 'Admin', email: 'admin@example.com', role: 'admin', status: 'active' };
  const upstream = vi.fn(async (url: string | URL | Request) => {
    if (new URL(String(url)).pathname.endsWith('/user/profile')) return Response.json({ code: 0, data: profile });
    return Response.json({ code: 0, data: {} });
  });
  const supportStore = options.unconfigured ? new PostgresSupportStore('') : new MemorySupportStore();
  const supportRealtime = new SupportRealtimeService('', options.now ?? Date.now, false);
  const instance = createApp(undefined, { supportStore, supportRealtime, supportValidationIntervalMs: 20, analyticsEnabled: false, client: new Sub2ApiClient('https://account.invalid/api/v1', upstream as typeof fetch) });
  cleanup.push(async () => {
    await supportRealtime.close();
    await Promise.all([supportStore.close(), instance.store.close(), instance.analytics.close(), instance.playgroundSettings.close(), instance.websiteSettings.close(), instance.conversations.close(), instance.authFlows.close()]);
  });
  const sessions = await Promise.all(['1', '2', '3'].map(async id => {
    const session = createSession({
      user: { id, username: id === '3' ? 'Admin' : `Customer ${id}`, email: `user${id}@example.com`, role: id === '3' ? 'admin' : 'user', status: 'active', balance: '0', concurrency: 1, avatarUrl: null },
      capabilities: readCapabilities({}, { keys: false, profile: false, redeem: false }),
      tokens: { accessToken: `access-${id}`, refreshToken: `refresh-${id}`, expiresAt: Date.now() + 3600_000 },
    });
    await instance.store.set(session); return session;
  }));
  const [customer, other, admin] = sessions as [PortalSession, PortalSession, PortalSession];
  const request = (session: PortalSession, path: string, method = 'GET', body?: unknown) => instance.app.request(`/portal/v1${path}`, { method, headers: headers(session), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const upload = (session: PortalSession, path: string, body: FormData) => {
    const uploadHeaders: Record<string, string> = headers(session); delete uploadHeaders['content-type'];
    return instance.app.request(`/portal/v1${path}`, { method: 'POST', headers: uploadHeaders, body });
  };
  const create = async () => {
    const input = { clientTicketId: randomUUID(), clientMessageId: randomUUID(), subject: 'API access', message: 'Please help with a request.' };
    const response = await request(customer, '/support/tickets', 'POST', input);
    expect(response.status).toBe(200);
    return { input, data: (await response.json()).data };
  };
  return { ...instance, supportStore, supportRealtime, customer, other, admin, profile, request, upload, create };
}

describe('support image attachments', () => {
  it('normalizes customer images, serves only the owner or verified admin, and keeps bytes out of events', async () => {
    const f = await fixture();
    const publish = vi.spyOn(f.supportRealtime, 'publish');
    const source = await sharp(await screenshot('#ff0000')).composite([{ input: await screenshot('#0000ff', 20, 20), left: 20, top: 0 }])
      .withMetadata({ orientation: 6 }).jpeg({ quality: 95 }).toBuffer();
    const response = await f.upload(f.customer, '/support/tickets', imageForm(imageFields(), source, 'image/jpeg'));
    expect(response.status).toBe(200);
    const { ticket, message } = (await response.json()).data;
    expect(ticket.lastMessage).toBe('Image');
    expect(message.body).toBe('');
    expect(message.image).toMatchObject({ mimeType: 'image/webp', width: 20, height: 40 });
    expect(Object.keys(message.image).sort()).toEqual(['url', 'mimeType', 'width', 'height', 'byteSize'].sort());
    expect(message).not.toHaveProperty('imageHash');
    const record = await f.supportStore.image({ id: '1', label: '', email: '', admin: false }, ticket.id, message.id);
    expect(record.sha256).toBe(createHash('sha256').update(source).digest('hex'));
    expect(record.bytes.equals(source)).toBe(false);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]![0].message).toEqual(message);
    const imagePath = message.image.url.replace('/portal/v1', '');
    expect((await f.app.request(message.image.url)).status).toBe(401);
    expect((await f.request(f.other, imagePath)).status).toBe(404);
    for (const session of [f.customer, f.admin]) {
      const image = await f.request(session, imagePath);
      expect(image.status).toBe(200);
      expect(image.headers.get('content-type')).toBe('image/webp');
      expect(image.headers.get('cache-control')).toBe('private, no-store');
      expect(image.headers.get('x-content-type-options')).toBe('nosniff');
      const bytes = Buffer.from(await image.arrayBuffer());
      expect(bytes.length).toBe(message.image.byteSize);
      expect(bytes.length).toBeLessThanOrEqual(512 * 1024);
      const meta = await sharp(bytes).metadata();
      expect(meta).toMatchObject({ format: 'webp', width: 20, height: 40 });
      expect(meta.exif).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
      await expectImagePixels(bytes, [{ x: 10, y: 8, rgba: [255, 0, 0, 255] }, { x: 10, y: 32, rgba: [0, 0, 255, 255] }]);
    }
    const reply = await f.upload(f.customer, `/support/tickets/${ticket.id}/messages`, imageForm({ clientMessageId: randomUUID(), message: 'A second view' }, await screenshot('#abcdef')));
    expect(reply.status).toBe(200);
    expect((await reply.json()).data.message).toMatchObject({ body: 'A second view', image: { mimeType: 'image/webp' } });
  });

  it('accepts an original screenshot above 512 KiB and 1600 pixels and preserves its content after resizing', async () => {
    const f = await fixture();
    const width = 2400, height = 1200, pixels = Buffer.alloc(width * height * 3);
    const colors = [[240, 32, 32], [32, 210, 32], [32, 32, 240], [240, 240, 240]];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const color = x >= 120 && x < 720 && y >= 80 && y < 110 ? [16, 16, 16] : colors[(y >= 600 ? 2 : 0) + (x >= 1200 ? 1 : 0)]!;
      pixels.set(color, (y * width + x) * 3);
    }
    // Uncompressed PNG represents a large original rather than a browser-prepared thumbnail.
    const source = await sharp(pixels, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
    expect(source.length).toBeGreaterThan(512 * 1024);
    expect(source.length).toBeLessThanOrEqual(10 * 1024 * 1024);
    const response = await f.upload(f.customer, '/support/tickets', imageForm(imageFields(), source));
    expect(response.status).toBe(200);
    const { ticket, message } = (await response.json()).data;
    expect(message.image).toMatchObject({ width: 1600, height: 800, mimeType: 'image/webp' });
    expect(message.image.byteSize).toBeLessThanOrEqual(512 * 1024);
    const record = await f.supportStore.image({ id: '1', label: '', email: '', admin: false }, ticket.id, message.id);
    expect(record.sha256).toBe(createHash('sha256').update(source).digest('hex'));
    await expectImagePixels(record.bytes, [
      { x: 400, y: 200, rgba: [240, 32, 32, 255] }, { x: 1200, y: 200, rgba: [32, 210, 32, 255] },
      { x: 400, y: 600, rgba: [32, 32, 240, 255] }, { x: 1200, y: 600, rgba: [240, 240, 240, 255] },
      { x: 200, y: 60, rgba: [16, 16, 16, 255] },
    ]);
    const reply = await f.upload(f.customer, `/support/tickets/${ticket.id}/messages`, imageForm({ clientMessageId: randomUUID(), message: '' }, source));
    expect(reply.status).toBe(200);
    expect((await reply.json()).data.message.image).toMatchObject({ width: 1600, height: 800 });
  });

  it('preserves transparency and does not enlarge small originals', async () => {
    const f = await fixture();
    const source = await sharp({ create: { width: 120, height: 60, channels: 4, background: '#ff000080' } })
      .composite([{ input: await screenshot('#00ff00', 40, 60), top: 0, left: 80 }]).png().toBuffer();
    const response = await f.upload(f.customer, '/support/tickets', imageForm(imageFields(), source));
    expect(response.status).toBe(200);
    const { ticket, message } = (await response.json()).data;
    expect(message.image).toMatchObject({ width: 120, height: 60 });
    const record = await f.supportStore.image({ id: '1', label: '', email: '', admin: false }, ticket.id, message.id);
    await expectImagePixels(record.bytes, [{ x: 20, y: 30, rgba: [255, 0, 0, 128] }, { x: 100, y: 30, rgba: [0, 255, 0, 255] }]);
  });

  it('checks ownership and write limits before attempting to decode images, and verifies active admin access', async () => {
    const f = await fixture();
    const { data } = await f.create();
    const invalid = imageForm({ clientMessageId: randomUUID(), message: '' }, new Uint8Array([1, 2, 3]));
    expect((await f.upload(f.other, `/support/tickets/${data.ticket.id}/messages`, invalid)).status).toBe(404);
    const response = await f.upload(f.customer, '/support/tickets', imageForm(imageFields(), await screenshot()));
    const message = (await response.json()).data.message;
    f.profile.role = 'user';
    expect((await f.request(f.admin, message.image.url.replace('/portal/v1', ''))).status).toBe(403);
    const limit = vi.spyOn(f.store, 'hitRateLimit').mockResolvedValue(true);
    expect((await f.upload(f.customer, '/support/tickets', imageForm(imageFields(), new Uint8Array([1, 2, 3])))).status).toBe(429);
    expect(limit).toHaveBeenCalledWith('support:write:1', 30, 60);
  });

  it('deduplicates exact image retries and rejects reuse with changed or missing image content', async () => {
    const f = await fixture();
    const publish = vi.spyOn(f.supportRealtime, 'publish');
    const fields = imageFields('Check this screenshot'), bytes = await screenshot();
    const first = await f.upload(f.customer, '/support/tickets', imageForm(fields, bytes));
    const data = (await first.json()).data;
    const duplicate = await f.upload(f.customer, '/support/tickets', imageForm(fields, bytes));
    expect((await duplicate.json()).data.message.id).toBe(data.message.id);
    expect((await f.upload(f.customer, '/support/tickets', imageForm(fields, await screenshot('#ff0000')))).status).toBe(409);
    // Distinct uploaded files must conflict even when their pixels normalize identically.
    const samePixels = await sharp(bytes).withMetadata({ density: 144 }).png().toBuffer();
    expect(samePixels.equals(bytes)).toBe(false);
    const normalized = await Promise.all([bytes, samePixels].map(source => sharp(source).rotate().webp({ quality: 80, effort: 3 }).toBuffer()));
    expect(normalized[0]!.equals(normalized[1]!)).toBe(true);
    expect((await f.upload(f.customer, '/support/tickets', imageForm(fields, samePixels))).status).toBe(409);
    expect((await f.request(f.customer, '/support/tickets', 'POST', fields)).status).toBe(409);
    expect(publish).toHaveBeenCalledTimes(1);
    const detail = (await (await f.request(f.customer, `/support/tickets/${data.ticket.id}`)).json()).data;
    expect(detail.messages).toHaveLength(1);
  });

  it('keeps already-compressed browser images within the limit when re-encoding would enlarge them', async () => {
    const f = await fixture();
    const pixels = noisyPixels(940, 940);
    const source = await sharp(pixels, { raw: { width: 940, height: 940, channels: 3 } }).webp({ quality: 62 }).toBuffer();
    expect(source.length).toBeLessThanOrEqual(512 * 1024);
    expect((await sharp(source).webp({ quality: 80, effort: 3 }).toBuffer()).length).toBeGreaterThan(512 * 1024);
    const response = await f.upload(f.customer, '/support/tickets', imageForm(imageFields(), source, 'image/webp'));
    expect(response.status).toBe(200);
    const { message } = (await response.json()).data;
    expect(message.image).toMatchObject({ width: 940, height: 940, mimeType: 'image/webp' });
    expect(message.image.byteSize).toBeLessThanOrEqual(512 * 1024);
    const stored = await f.request(f.customer, message.image.url.replace('/portal/v1', ''));
    expect((await sharp(Buffer.from(await stored.arrayBuffer())).metadata()).format).toBe('webp');
  });

  it('reduces dimensions when a detailed original cannot meet the storage limit at 1600 pixels', async () => {
    const f = await fixture();
    const pixels = noisyPixels(1600, 1600);
    const source = await sharp(pixels, { raw: { width: 1600, height: 1600, channels: 3 } }).png().toBuffer();
    expect((await sharp(source).webp({ quality: 60, effort: 3 }).toBuffer()).length).toBeGreaterThan(512 * 1024);
    const response = await f.upload(f.customer, '/support/tickets', imageForm(imageFields(), source));
    expect(response.status).toBe(200);
    const { message } = (await response.json()).data;
    expect([1280, 1024]).toContain(message.image.width);
    expect(message.image.height).toBe(message.image.width);
    expect(message.image.byteSize).toBeLessThanOrEqual(512 * 1024);
  }, 20_000);

  it('rejects malformed, oversized, unsupported, animated, or excessive-dimension images', async () => {
    const f = await fixture();
    const animated = Buffer.from([...[255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0], ...[0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 255]]);
    const animation = await sharp(animated, { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
    expect((await sharp(animation).metadata()).pages).toBe(2);
    const truncated = (await screenshot()).subarray(0, 65);
    expect((await sharp(truncated).metadata()).width).toBe(40);
    const apng = await animatedPng();
    expect((await sharp(apng).metadata()).format).toBe('png');
    const cases: Array<[Uint8Array, string]> = [
      [new Uint8Array([1, 2, 3]), 'image/png'], [new Uint8Array(10 * 1024 * 1024 + 1), 'image/png'],
      [await screenshot('#123456', 8001, 4000), 'image/png'],
      [truncated, 'image/png'],
      [new TextEncoder().encode('<svg></svg>'), 'image/svg+xml'],
      [new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"></svg>'), 'image/png'],
      [animation, 'image/webp'], [apng, 'image/png'],
    ];
    for (const [bytes, mime] of cases) {
      const response = await f.upload(f.customer, '/support/tickets', imageForm(imageFields(), bytes, mime));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('SUPPORT_IMAGE_INVALID');
    }
    expect((await (await f.request(f.customer, '/support/tickets')).json()).data.total).toBe(0);
  });

  it('allows one customer image per message, requires text or an image, and retains strict limits elsewhere', async () => {
    const f = await fixture();
    const { data } = await f.create();
    const bytes = await screenshot();
    const duplicate = imageForm(imageFields(), bytes);
    duplicate.append('image', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'second.png');
    expect((await f.upload(f.customer, '/support/tickets', duplicate)).status).toBe(400);
    expect((await f.upload(f.admin, `/admin/support/tickets/${data.ticket.id}/messages`, imageForm(imageFields(), bytes))).status).toBe(403);
    expect((await f.upload(f.admin, `/support/tickets/${data.ticket.id}/messages`, imageForm(imageFields(), bytes))).status).toBe(403);
    expect((await f.request(f.customer, '/support/tickets', 'POST', imageFields('   '))).status).toBe(400);
    const missingSubject = imageFields(); delete (missingSubject as Partial<typeof missingSubject>).subject;
    expect((await f.upload(f.customer, '/support/tickets', imageForm(missingSubject, bytes))).status).toBe(400);
    expect((await f.upload(f.customer, '/support/tickets', imageForm(imageFields(), new Uint8Array(11 * 1024 * 1024)))).status).toBe(413);
    expect((await f.upload(f.customer, `/support/tickets/${data.ticket.id}/messages`, imageForm(imageFields(), new Uint8Array(11 * 1024 * 1024)))).status).toBe(413);
    expect((await f.request(f.customer, '/support/tickets', 'POST', imageFields('x'.repeat(129 * 1024)))).status).toBe(413);
    expect((await f.request(f.customer, `/support/tickets/${data.ticket.id}/messages`, 'POST', { clientMessageId: randomUUID(), message: 'x'.repeat(129 * 1024) })).status).toBe(413);
    expect((await f.upload(f.admin, `/admin/support/tickets/${data.ticket.id}/messages`, imageForm(imageFields(), new Uint8Array(129 * 1024)))).status).toBe(413);
    expect((await f.upload(f.customer, '/support/tickets/not-a-ticket/read', imageForm(imageFields(), new Uint8Array(129 * 1024)))).status).toBe(413);
  });
});

describe('support HTTP authorization and persistence boundary', () => {
  it('creates a welcome once for an existing account without message quota or duplicate notifications', async () => {
    const f = await fixture(), regular = await f.create();
    const publish = vi.spyOn(f.supportRealtime, 'publish'), limiter = vi.spyOn(f.store, 'hitRateLimit');
    const responses = await Promise.all(Array.from({ length: 8 }, () => f.request(f.customer, '/support/welcome', 'POST', { ownerId: f.other.user.id, message: 'Forged welcome' })));
    expect(responses.every(response => response.status === 200)).toBe(true);
    const results = await Promise.all(responses.map(async response => (await response.json()).data));
    expect(results.filter(result => result.created)).toHaveLength(1);
    const welcome = results[0];
    expect(new Set(results.map(result => result.message.id)).size).toBe(1);
    expect(welcome).toMatchObject({ ticket: { kind: 'welcome', status: 'open', unreadCount: 1 }, message: { kind: 'welcome', sender: 'admin', sequence: 1 } });
    expect(welcome.message.body).not.toContain('Forged welcome');
    expect(welcome.ticket).not.toHaveProperty('firstViewedAt');
    expect(welcome.ticket).not.toHaveProperty('ownerId');
    expect(limiter).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledExactlyOnceWith({ type: 'tickets', ticketId: welcome.ticket.id }, { admins: true, ownerId: '1' });
    const inbox = (await (await f.request(f.admin, '/admin/support/tickets')).json()).data;
    expect(inbox.total).toBe(1); expect(inbox.items[0].id).toBe(regular.data.ticket.id);
    const report = (await (await f.request(f.admin, '/admin/support/welcome?page=1&search=user1%40example.com')).json()).data;
    expect(report).toEqual({ items: [{ ticketId: welcome.ticket.id, ownerId: '1', ownerLabel: 'Customer 1', ownerEmail: 'user1@example.com', sentAt: welcome.message.createdAt, firstViewedAt: null, firstReplyAt: null }], total: 1 });
    expect((await (await f.request(f.other, '/support/tickets')).json()).data.items).toEqual([]);
    expect((await f.request(f.other, `/support/tickets/${welcome.ticket.id}`)).status).toBe(404);
  });

  it('tracks explicit welcome viewing separately from read receipts and places the first reply in the inbox', async () => {
    const f = await fixture();
    const welcome = (await (await f.request(f.customer, '/support/welcome', 'POST')).json()).data;
    await f.request(f.customer, `/support/tickets/${welcome.ticket.id}/read`, 'POST', { sequence: 1 });
    expect((await (await f.request(f.admin, '/admin/support/welcome')).json()).data.items[0].firstViewedAt).toBeNull();
    const before = (await (await f.request(f.customer, `/support/tickets/${welcome.ticket.id}`)).json()).data;
    const publish = vi.spyOn(f.supportRealtime, 'publish');
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await f.request(f.customer, '/support/welcome/viewed', 'POST', {});
      expect(response.status).toBe(200); expect((await response.json()).data).toEqual({ viewed: true });
    }
    expect(publish).toHaveBeenCalledExactlyOnceWith({ type: 'tickets', ticketId: welcome.ticket.id }, { admins: true, ownerId: undefined });
    expect((await (await f.request(f.customer, `/support/tickets/${welcome.ticket.id}`)).json()).data).toEqual(before);
    const viewed = (await (await f.request(f.admin, '/admin/support/welcome')).json()).data.items[0];
    expect(viewed.firstViewedAt).toEqual(expect.any(String)); expect(viewed.firstReplyAt).toBeNull();
    expect((await (await f.request(f.admin, '/admin/support/tickets')).json()).data.total).toBe(0);
    const reply = (await (await f.request(f.customer, `/support/tickets/${welcome.ticket.id}/messages`, 'POST', { clientMessageId: randomUUID(), message: 'Thanks, I have a question.' })).json()).data;
    const report = (await (await f.request(f.admin, '/admin/support/welcome')).json()).data.items[0];
    expect(report.firstViewedAt).toBe(viewed.firstViewedAt); expect(report.firstReplyAt).toBe(reply.message.createdAt);
    expect((await (await f.request(f.admin, '/admin/support/tickets')).json()).data).toMatchObject({ total: 1, unreadCount: 1 });
  });

  it('protects welcome creation, viewing, and reporting with session, Origin, CSRF, and role checks', async () => {
    const f = await fixture();
    for (const path of ['/support/welcome', '/support/welcome/viewed']) {
      expect((await f.app.request('/portal/v1' + path, { method: 'POST' })).status).toBe(401);
      for (const changed of [{ origin: 'https://attacker.invalid' }, { 'x-csrf-token': '' }]) {
        expect((await f.app.request('/portal/v1' + path, { method: 'POST', headers: { ...headers(f.customer), ...changed }, body: '{}' })).status).toBe(403);
      }
      expect((await f.request(f.admin, path, 'POST')).status).toBe(403);
    }
    expect((await f.request(f.customer, '/support/welcome/viewed', 'POST')).status).toBe(404);
    expect((await f.request(f.customer, '/admin/support/welcome')).status).toBe(403);
    expect((await f.request(f.admin, '/admin/support/welcome?page=0')).status).toBe(400);
    const revoked = await fixture(); revoked.profile.role = 'user';
    expect((await revoked.request(revoked.admin, '/admin/support/welcome')).status).toBe(403);
    const unavailable = await fixture({ unconfigured: true });
    expect((await unavailable.request(unavailable.customer, '/support/welcome', 'POST')).status).toBe(503);
  });

  it('lets only admins update Online and public status text, including a clear without changing availability', async () => {
    const f = await fixture();
    const response = await f.request(f.admin, '/admin/support/presence', 'PATCH', { mode: 'online', statusText: '  Here to help  ' });
    expect((await response.json()).data).toEqual({ mode: 'online', status: 'online', statusText: 'Here to help', lastSeenAt: null });
    expect((await (await f.request(f.customer, '/support/presence')).json()).data).toEqual({ status: 'online', statusText: 'Here to help', lastSeenAt: null });
    expect((await f.request(f.customer, '/admin/support/presence', 'PATCH', { statusText: 'Changed' })).status).toBe(403);
    const cleared = await f.request(f.admin, '/admin/support/presence', 'PATCH', { statusText: '  ' });
    expect((await cleared.json()).data).toEqual({ mode: 'online', status: 'online', statusText: '', lastSeenAt: null });
    for (const body of [{}, { mode: 'invalid' }, { statusText: 'x'.repeat(161) }, { statusText: null }, { lastSeenAt: '2099-01-01T00:00:00.000Z' }]) {
      expect((await f.request(f.admin, '/admin/support/presence', 'PATCH', body)).status).toBe(400);
    }
  });

  it('exposes genuine last activity through HTTP and customer events without allowing timestamp spoofing', async () => {
    let now = Date.UTC(2026, 8, 20, 8);
    const f = await fixture({ now: () => now });
    const response = await f.request(f.customer, '/support/events');
    const reader = response.body!.getReader(), decoder = new TextDecoder();
    cleanup.push(async () => { await reader.cancel(); });
    expect(decoder.decode((await reader.read()).value)).toContain('"type":"ready"');
    expect((await (await f.request(f.customer, '/support/presence')).json()).data.lastSeenAt).toBeNull();
    const tabId = randomUUID(), lastSeenAt = new Date(now).toISOString();
    expect((await f.request(f.customer, '/admin/support/heartbeat', 'POST', { tabId, active: true })).status).toBe(403);
    const beat = await f.request(f.admin, '/admin/support/heartbeat', 'POST', { tabId, active: true, lastSeenAt: '2099-01-01T00:00:00.000Z' });
    expect((await beat.json()).data).toEqual({ status: 'online', mode: 'automatic', statusText: '', lastSeenAt });
    const event = decoder.decode((await reader.read()).value);
    expect(event).toContain(JSON.stringify({ type: 'presence', presence: { status: 'online', statusText: '', lastSeenAt } }));
    expect(event).not.toContain('mode');
    now += 60_000;
    const idle = await f.request(f.admin, '/admin/support/heartbeat', 'POST', { tabId, active: false });
    expect((await idle.json()).data.lastSeenAt).toBe(lastSeenAt);
    const patched = await f.request(f.admin, '/admin/support/presence', 'PATCH', { mode: 'offline', lastSeenAt: '2099-01-01T00:00:00.000Z' });
    expect((await patched.json()).data).toEqual({ status: 'offline', mode: 'offline', statusText: '', lastSeenAt });
    expect((await (await f.request(f.customer, '/support/presence')).json()).data).toEqual({ status: 'offline', statusText: '', lastSeenAt });
    expect(decoder.decode((await reader.read()).value)).toContain(JSON.stringify({ type: 'presence', presence: { status: 'offline', statusText: '', lastSeenAt } }));
  });

  it('accepts only the supported preferred languages and supplies English for older create requests', async () => {
    const f = await fixture();
    const { input, data } = await f.create();
    expect(data.ticket.preferredLanguage).toBe('en');
    const englishRetry = await f.request(f.customer, '/support/tickets', 'POST', { ...input, preferredLanguage: 'en' });
    expect((await englishRetry.json()).data.message.id).toBe(data.message.id);
    expect((await f.request(f.customer, '/support/tickets', 'POST', { ...input, preferredLanguage: 'de' })).status).toBe(409);
    for (const preferredLanguage of SUPPORT_LANGUAGE_CODES) {
      const response = await f.request(f.customer, '/support/tickets', 'POST', { ...imageFields('Please reply in my preferred language.'), preferredLanguage });
      expect(response.status).toBe(200);
      const { ticket } = (await response.json()).data;
      expect(ticket.preferredLanguage).toBe(preferredLanguage);
      const admin = await f.request(f.admin, `/admin/support/tickets/${ticket.id}`);
      expect((await admin.json()).data.ticket.preferredLanguage).toBe(preferredLanguage);
    }
    for (const preferredLanguage of ['EN', 'en-US', '', 'unsupported', null, 42]) {
      expect((await f.request(f.customer, '/support/tickets', 'POST', { ...imageFields('Hello'), preferredLanguage })).status).toBe(400);
    }
  });

  it('preserves a preferred language on multipart creation and treats changing it as a conflicting retry', async () => {
    const f = await fixture();
    const fields = { ...imageFields(), preferredLanguage: 'ja' }, bytes = await screenshot();
    const first = await f.upload(f.customer, '/support/tickets', imageForm(fields, bytes));
    expect(first.status).toBe(200);
    const data = (await first.json()).data;
    expect(data.ticket.preferredLanguage).toBe('ja');
    expect(data.message.image.mimeType).toBe('image/webp');
    const repeated = await f.upload(f.customer, '/support/tickets', imageForm(fields, bytes));
    expect((await repeated.json()).data.message.id).toBe(data.message.id);
    expect((await f.upload(f.customer, '/support/tickets', imageForm({ ...fields, preferredLanguage: 'vi' }, bytes))).status).toBe(409);
    expect((await f.upload(f.customer, '/support/tickets', imageForm({ ...imageFields(), preferredLanguage: 'unsupported' }, bytes))).status).toBe(400);
    const detail = await f.request(f.customer, `/support/tickets/${data.ticket.id}`);
    expect((await detail.json()).data.ticket.preferredLanguage).toBe('ja');
  });

  it('requires session, exact Origin, CSRF, and verified administrator permissions', async () => {
    const f = await fixture();
    const input = { clientTicketId: randomUUID(), clientMessageId: randomUUID(), subject: 'Help', message: 'Hi' };
    expect((await f.app.request('/portal/v1/support/tickets')).status).toBe(401);
    expect((await f.request(f.customer, '/admin/support/tickets')).status).toBe(403);
    for (const changed of [{ origin: 'https://attacker.invalid' }, { 'x-csrf-token': '' }]) {
      expect((await f.app.request('/portal/v1/support/tickets', { method: 'POST', headers: { ...headers(f.customer), ...changed }, body: JSON.stringify(input) })).status).toBe(403);
    }
    f.profile.role = 'user';
    expect((await f.request(f.admin, '/admin/support/presence', 'PATCH', { mode: 'away' })).status).toBe(403);
  });

  it('isolates customer tickets and keeps receipt and identity fields private', async () => {
    const f = await fixture();
    const { data } = await f.create();
    expect(data.ticket).not.toHaveProperty('ownerId');
    expect(data.ticket).not.toHaveProperty('customerReadSequence');
    expect((await f.request(f.other, `/support/tickets/${data.ticket.id}`)).status).toBe(404);
    expect((await f.request(f.other, `/support/tickets/${data.ticket.id}/read`, 'POST', { sequence: 1 })).status).toBe(404);
    expect((await (await f.request(f.other, '/support/tickets')).json()).data.items).toEqual([]);
    const adminDetail = (await (await f.request(f.admin, `/admin/support/tickets/${data.ticket.id}`)).json()).data;
    expect(adminDetail.ticket).toMatchObject({ ownerId: '1', ownerEmail: 'user1@example.com', unreadCount: 1 });
  });

  it('preserves sent-message retries after resolution but requires an administrator to reopen before new customer replies', async () => {
    const f = await fixture();
    const publish = vi.spyOn(f.supportRealtime, 'publish');
    const { input, data } = await f.create();
    expect((await f.request(f.customer, '/support/tickets', 'POST', input)).status).toBe(200);
    expect(publish).toHaveBeenCalledTimes(1);
    const sentBody = { clientMessageId: randomUUID(), message: 'Sent before resolution.' };
    const sent = (await (await f.request(f.customer, `/support/tickets/${data.ticket.id}/messages`, 'POST', sentBody)).json()).data;
    await f.request(f.admin, `/admin/support/tickets/${data.ticket.id}`, 'PATCH', { status: 'resolved' });
    expect((await (await f.request(f.customer, '/support/tickets', 'POST', input)).json()).data.ticket.status).toBe('resolved');
    const retry = await f.request(f.customer, `/support/tickets/${data.ticket.id}/messages`, 'POST', sentBody);
    expect((await retry.json()).data).toMatchObject({ ticket: { status: 'resolved', messageCount: 2 }, message: { id: sent.message.id } });
    const body = { clientMessageId: randomUUID(), message: 'One more question.' };
    const response = await f.request(f.customer, `/support/tickets/${data.ticket.id}/messages`, 'POST', body);
    expect(response.status).toBe(403);
    expect((await response.json()).error).toMatchObject({ code: 'SUPPORT_TICKET_RESOLVED', message: 'This ticket is resolved. Create a new ticket for more help.' });
    expect(publish).toHaveBeenCalledTimes(3);
    const adminReply = await f.request(f.admin, `/admin/support/tickets/${data.ticket.id}/messages`, 'POST', { clientMessageId: randomUUID(), message: 'Administrator follow-up.' });
    expect((await adminReply.json()).data.ticket).toMatchObject({ status: 'resolved', messageCount: 3 });
    await f.request(f.admin, `/admin/support/tickets/${data.ticket.id}`, 'PATCH', { status: 'open' });
    const reopenedReply = await f.request(f.customer, `/support/tickets/${data.ticket.id}/messages`, 'POST', body);
    expect((await reopenedReply.json()).data.ticket).toMatchObject({ status: 'open', messageCount: 4 });
  });

  it('forbids all customer status changes, keeps closed history readable, and publishes only actual administrator changes', async () => {
    const f = await fixture();
    const { data } = await f.create(), path = `/support/tickets/${data.ticket.id}`;
    await f.request(f.admin, `/admin${path}`, 'PATCH', { status: 'resolved' });
    const before = (await (await f.request(f.customer, path)).json()).data;
    const publish = vi.spyOn(f.supportRealtime, 'publish');
    expect((await f.request(f.other, path, 'PATCH', { status: 'open' })).status).toBe(403);
    expect((await f.request(f.customer, '/support/tickets/' + randomUUID(), 'PATCH', { status: 'open' })).status).toBe(403);
    expect((await f.request(f.customer, path, 'PATCH', { status: 'resolved' })).status).toBe(403);
    expect((await f.request(f.customer, path, 'PATCH', { status: 'open' })).status).toBe(403);
    const blocked = await f.request(f.customer, `${path}/messages`, 'POST', { clientMessageId: randomUUID(), message: 'New reply' });
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).error.code).toBe('SUPPORT_TICKET_RESOLVED');
    expect(publish).not.toHaveBeenCalled();
    expect((await (await f.request(f.customer, path)).json()).data).toEqual(before);
    const opened = await f.request(f.admin, `/admin${path}`, 'PATCH', { status: 'open' });
    expect(opened.status).toBe(200);
    expect((await opened.json()).data).toEqual({ status: 'open' });
    expect(publish).toHaveBeenCalledExactlyOnceWith({ type: 'tickets', ticketId: data.ticket.id }, { admins: true, ownerId: '1' });
    const after = (await (await f.request(f.customer, path)).json()).data;
    expect(after.ticket).toMatchObject({ status: 'open', messageCount: 1, unreadCount: 0, preferredLanguage: 'en' });
    expect(after.messages).toEqual(before.messages);
    expect(after.ticket).not.toHaveProperty('customerReadSequence');
    expect(after.ticket).not.toHaveProperty('adminReadSequence');
    expect((await f.request(f.customer, path, 'PATCH', { status: 'open' })).status).toBe(403);
    expect((await f.request(f.admin, `/admin${path}`, 'PATCH', { status: 'open' })).status).toBe(200);
    expect(publish).toHaveBeenCalledTimes(1);
    expect((await (await f.request(f.customer, path)).json()).data).toEqual(after);
  });

  it('requires authentication, Origin and CSRF on forbidden customer status requests without reaching mutation or write limiting', async () => {
    const f = await fixture();
    const { data } = await f.create(), path = `/support/tickets/${data.ticket.id}`;
    await f.request(f.admin, `/admin${path}`, 'PATCH', { status: 'resolved' });
    const mutation = vi.spyOn(f.supportStore, 'setStatus');
    const body = JSON.stringify({ status: 'open' });
    expect((await f.app.request('/portal/v1' + path, { method: 'PATCH', body })).status).toBe(401);
    for (const changed of [{ origin: 'https://attacker.invalid' }, { 'x-csrf-token': '' }]) {
      expect((await f.app.request('/portal/v1' + path, { method: 'PATCH', headers: { ...headers(f.customer), ...changed }, body })).status).toBe(403);
    }
    const rateLimit = vi.spyOn(f.store, 'hitRateLimit').mockResolvedValue(true);
    expect((await f.request(f.customer, path, 'PATCH', { status: 'open' })).status).toBe(403);
    expect(rateLimit).not.toHaveBeenCalled();
    expect(mutation).not.toHaveBeenCalled();
    expect((await (await f.request(f.customer, path)).json()).data.ticket.status).toBe('resolved');
  });

  it('blocks new image replies on closed tickets while preserving private image reads and exact upload retries', async () => {
    const f = await fixture(), bytes = await screenshot(), fields = imageFields();
    const created = (await (await f.upload(f.customer, '/support/tickets', imageForm(fields, bytes))).json()).data;
    const path = `/support/tickets/${created.ticket.id}`, replyFields = { clientMessageId: randomUUID(), message: '' };
    const sent = (await (await f.upload(f.customer, `${path}/messages`, imageForm(replyFields, bytes))).json()).data;
    await f.request(f.admin, `/admin${path}/read`, 'POST', { sequence: 2 });
    await f.request(f.admin, `/admin${path}`, 'PATCH', { status: 'resolved' });
    const before = (await (await f.request(f.admin, `/admin${path}`)).json()).data;
    const publish = vi.spyOn(f.supportRealtime, 'publish');
    const rejected = await f.upload(f.customer, `${path}/messages`, imageForm({ clientMessageId: randomUUID(), message: '' }, bytes));
    expect(rejected.status).toBe(403);
    expect((await rejected.json()).error.code).toBe('SUPPORT_TICKET_RESOLVED');
    expect((await f.upload(f.other, `${path}/messages`, imageForm({ clientMessageId: randomUUID(), message: '' }, bytes))).status).toBe(404);
    const retry = await f.upload(f.customer, `${path}/messages`, imageForm(replyFields, bytes));
    expect((await retry.json()).data).toMatchObject({ ticket: { status: 'resolved', messageCount: 2 }, message: { id: sent.message.id } });
    const createRetry = await f.upload(f.customer, '/support/tickets', imageForm(fields, bytes));
    expect((await createRetry.json()).data).toMatchObject({ ticket: { status: 'resolved', messageCount: 2 }, message: { id: created.message.id } });
    expect((await f.request(f.customer, sent.message.image.url.replace('/portal/v1', ''))).status).toBe(200);
    expect((await f.request(f.other, sent.message.image.url.replace('/portal/v1', ''))).status).toBe(404);
    expect((await (await f.request(f.admin, `/admin${path}`)).json()).data).toEqual(before);
    expect(publish).not.toHaveBeenCalled();
  });

  it('syncs admin reads only to admins and exposes customer receipts only in admin views', async () => {
    const f = await fixture();
    const { data } = await f.create();
    const publish = vi.spyOn(f.supportRealtime, 'publish');
    const before = (await (await f.request(f.customer, `/support/tickets/${data.ticket.id}`)).json()).data;
    await f.request(f.admin, `/admin/support/tickets/${data.ticket.id}/read`, 'POST', { sequence: 1 });
    expect(publish).toHaveBeenLastCalledWith({ type: 'read', ticketId: data.ticket.id }, { admins: true, ownerId: undefined });
    const after = (await (await f.request(f.customer, `/support/tickets/${data.ticket.id}`)).json()).data;
    expect(after).toEqual(before);
    await f.request(f.admin, `/admin/support/tickets/${data.ticket.id}/messages`, 'POST', { clientMessageId: randomUUID(), message: 'Here is the solution.' });
    await f.request(f.customer, `/support/tickets/${data.ticket.id}/read`, 'POST', { sequence: 2 });
    expect(publish).toHaveBeenLastCalledWith({ type: 'read', ticketId: data.ticket.id }, { admins: true, ownerId: '1' });
    const adminDetail = (await (await f.request(f.admin, `/admin/support/tickets/${data.ticket.id}`)).json()).data;
    expect(adminDetail.ticket.customerReadSequence).toBe(2);
    expect(adminDetail.ticket.customerReadAt).toEqual(expect.any(String));
  });

  it('preserves committed messages when live delivery fails', async () => {
    const f = await fixture();
    vi.spyOn(f.supportRealtime, 'publish').mockRejectedValue(new Error('Redis unavailable'));
    const { data } = await f.create();
    expect((await (await f.request(f.customer, `/support/tickets/${data.ticket.id}`)).json()).data.messages).toHaveLength(1);
  });

  it('returns actionable unavailable errors before opening a stream and reports health', async () => {
    const f = await fixture({ unconfigured: true });
    for (const path of ['/support/tickets', '/support/events']) {
      const response = await f.request(f.customer, path);
      expect(response.status).toBe(503);
      expect((await response.json()).error.code).toBe('SUPPORT_UNAVAILABLE');
    }
    expect((await (await f.request(f.admin, '/admin/support/health')).json()).data).toEqual({ configured: false, storage: false, realtime: true });
  });

  it('closes a live stream immediately on logout and after session revocation', async () => {
    const f = await fixture();
    for (const useLogout of [true, false]) {
      const session = useLogout ? f.customer : f.other;
      const response = await f.request(session, '/support/events');
      const reader = response.body!.getReader();
      expect(new TextDecoder().decode((await reader.read()).value)).toContain('"type":"ready"');
      if (useLogout) await f.request(session, '/auth/logout', 'POST');
      else await f.store.revoke(session.id);
      expect(await reader.read()).toMatchObject({ done: true });
    }
  });

  it('terminates an admin stream when upstream privilege is revoked', async () => {
    const f = await fixture();
    const response = await f.request(f.admin, '/admin/support/events');
    const reader = response.body!.getReader();
    await reader.read();
    f.profile.role = 'user';
    // The first stream validation checks upstream independently of the HTTP middleware cache.
    expect(await reader.read()).toMatchObject({ done: true });
  });
});

describe('support presence and event privacy', () => {
  it('reads durable Redis last activity, falls back to legacy activity, and leaves missing or invalid timestamps unknown', async () => {
    const values = new Map<string, string>();
    const commands = {
      zCount: vi.fn().mockResolvedValue(0),
      mGet: vi.fn(async (keys: string[]) => keys.map(key => values.get(key) ?? null)),
    };
    const client = { isReady: true, isOpen: false, on: vi.fn(), duplicate: vi.fn(), withCommandOptions: vi.fn(() => commands) };
    client.duplicate.mockReturnValue(client);
    vi.spyOn(redis, 'createClient').mockReturnValue(client as unknown as ReturnType<typeof redis.createClient>);
    const live = new SupportRealtimeService('redis://fixture.invalid', () => Date.UTC(2026, 8, 20), false);
    cleanup.push(() => live.close());
    for (const [activity, lastSeen, expected] of [
      [null, null, null],
      ['1000000', null, 1000000],
      [null, '2000000', 2000000],
      ['1000000', '2000000', 2000000],
      ['2000000', '1000000', 2000000],
      ['invalid', 'invalid', null],
      ['1000000', 'invalid', 1000000],
      ['', '99999999999999999', null],
    ] as const) {
      values.clear();
      if (activity !== null) values.set('kr:support:activity', activity);
      if (lastSeen !== null) values.set('kr:support:last-seen', lastSeen);
      expect(await live.presence()).toEqual({ status: 'offline', statusText: '', lastSeenAt: expected === null ? null : new Date(expected).toISOString() });
    }
  });

  it('aggregates tabs, advances Online to Away, expires Offline, and remembers manual mode', async () => {
    let now = 1_000_000;
    const live = new SupportRealtimeService('', () => now, false);
    cleanup.push(() => live.close());
    expect(await live.presence()).toEqual({ status: 'offline', statusText: '', lastSeenAt: null });
    await live.heartbeat('admin', 'tab1', true);
    let lastSeenAt = new Date(now).toISOString();
    expect(await live.presence()).toEqual({ status: 'online', statusText: '', lastSeenAt });
    now += 100_000;
    await live.heartbeat('admin', 'tab2', false);
    now += 100_000;
    await live.heartbeat('admin', 'tab2', false);
    expect(await live.presence()).toEqual({ status: 'online', statusText: '', lastSeenAt });
    now += 100_000;
    await live.heartbeat('admin', 'tab2', false);
    expect(await live.presence()).toEqual({ status: 'away', statusText: '', lastSeenAt });
    await live.setMode('offline');
    await live.heartbeat('admin', 'tab1', true);
    lastSeenAt = new Date(now).toISOString();
    expect(await live.presence(true)).toEqual({ status: 'offline', mode: 'offline', statusText: '', lastSeenAt });
    await live.setMode('automatic');
    expect(await live.presence()).toEqual({ status: 'online', statusText: '', lastSeenAt });
    now += 120_000;
    expect(await live.presence()).toEqual({ status: 'offline', statusText: '', lastSeenAt });
  });

  it('keeps manual Online active without heartbeats or sessions until the mode changes', async () => {
    let now = 1_000_000;
    const live = new SupportRealtimeService('', () => now, false);
    cleanup.push(() => live.close());
    expect(await live.updatePresence({ mode: 'online', statusText: 'Available today' })).toEqual({ status: 'online', mode: 'online', statusText: 'Available today', lastSeenAt: null });
    now += 86_400_000;
    expect(await live.presence()).toEqual({ status: 'online', statusText: 'Available today', lastSeenAt: null });
    await live.heartbeat('admin', 'tab', false); await live.revoke('admin');
    expect(await live.presence()).toEqual({ status: 'online', statusText: 'Available today', lastSeenAt: null });
    await live.updatePresence({ statusText: '' });
    expect(await live.presence()).toEqual({ status: 'online', statusText: '', lastSeenAt: null });
    await live.setMode('away');
    expect(await live.presence()).toEqual({ status: 'offline', statusText: '', lastSeenAt: null });
    await live.heartbeat('admin', 'tab', true);
    const lastSeenAt = new Date(now).toISOString();
    expect(await live.presence()).toEqual({ status: 'away', statusText: '', lastSeenAt });
    await live.setMode('automatic');
    expect(await live.presence()).toEqual({ status: 'online', statusText: '', lastSeenAt });
    now += 120_000;
    expect(await live.presence()).toEqual({ status: 'offline', statusText: '', lastSeenAt });
  });

  it('keeps last activity monotonic across tabs and preserves it through logout and manual modes', async () => {
    let now = Date.UTC(2026, 8, 20, 8);
    const live = new SupportRealtimeService('', () => now, false);
    cleanup.push(() => live.close());
    await live.heartbeat('admin', 'tab1', true);
    now += 60_000;
    await live.heartbeat('admin', 'tab2', true);
    const lastSeenAt = new Date(now).toISOString();
    now -= 30_000;
    await live.heartbeat('admin', 'tab1', true);
    expect((await live.presence()).lastSeenAt).toBe(lastSeenAt);
    now += 90_000;
    await live.heartbeat('admin', 'tab2', false);
    expect((await live.presence()).lastSeenAt).toBe(lastSeenAt);
    for (const mode of ['away', 'offline', 'online', 'automatic'] as const) {
      await live.updatePresence({ mode, statusText: 'Replying soon' });
      expect((await live.presence()).lastSeenAt).toBe(lastSeenAt);
    }
    await live.revoke('admin');
    expect(await live.presence()).toEqual({ status: 'offline', statusText: 'Replying soon', lastSeenAt });
    now += 8 * 86_400_000;
    expect((await live.presence()).lastSeenAt).toBe(lastSeenAt);
    await live.heartbeat('admin', 'new-tab', true);
    expect((await live.presence()).lastSeenAt).toBe(new Date(now).toISOString());
  });

  it('delivers messages only to owner/admins, keeps admin reads private, and hides presence mode', async () => {
    const now = Date.UTC(2026, 8, 20, 8), lastSeenAt = new Date(now).toISOString();
    const live = new SupportRealtimeService('', () => now, false);
    cleanup.push(() => live.close());
    const owner: SupportEvent[] = [], other: SupportEvent[] = [], admin: SupportEvent[] = [];
    for (const [actorId, isAdmin, events] of [['owner', false, owner], ['other', false, other], ['admin', true, admin]] as const) {
      await live.subscribe({ actorId, admin: isAdmin, sessionId: actorId, receive: event => { events.push(event); }, close() {} });
    }
    await live.publish({ type: 'message', ticketId: 'ticket' }, { ownerId: 'owner', admins: true });
    await live.publish({ type: 'read', ticketId: 'ticket' }, { admins: true });
    expect(owner.map(event => event.type)).toEqual(['message']);
    expect(other).toEqual([]);
    expect(admin.map(event => event.type)).toEqual(['message', 'read']);
    await live.heartbeat('admin', 'tab', true);
    expect(owner.at(-1)).toEqual({ type: 'presence', presence: { status: 'online', statusText: '', lastSeenAt } });
    expect(admin.at(-1)).toEqual({ type: 'presence', presence: { status: 'online', mode: 'automatic', statusText: '', lastSeenAt } });
    await live.updatePresence({ statusText: 'Available for API questions' });
    expect(owner.at(-1)).toEqual({ type: 'presence', presence: { status: 'online', statusText: 'Available for API questions', lastSeenAt } });
    expect(other.at(-1)).toEqual(owner.at(-1));
    expect(admin.at(-1)).toEqual({ type: 'presence', presence: { status: 'online', mode: 'automatic', statusText: 'Available for API questions', lastSeenAt } });
    await live.updatePresence({ statusText: '' });
    expect(owner.at(-1)).toEqual({ type: 'presence', presence: { status: 'online', statusText: '', lastSeenAt } });
  });
});
