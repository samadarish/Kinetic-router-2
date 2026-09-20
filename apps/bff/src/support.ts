import type { Context, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import {
  supportCreateSchema, supportHeartbeatSchema, supportListSchema, supportPresenceSchema,
  supportReadSchema, supportReplySchema, supportStatusSchema, supportWelcomeListSchema, type SupportEvent,
} from '@kineticrouter/portal-contract';
import { SupportError, supportForbidden, supportInvalid, type SupportActor, type SupportStore } from './support-store.js';
import type { SupportRealtime } from './support-realtime.js';
import { prepareSupportImage } from './support-images.js';

type SupportRoutesOptions = {
  store: SupportStore;
  realtime: SupportRealtime;
  actor(c: Context): SupportActor;
  sessionId(c: Context): string;
  validate(c: Context, admin: boolean): Promise<boolean>;
  rateLimit(c: Context): Promise<boolean>;
  validationIntervalMs?: number;
};
const idSchema = z.string().uuid();
const beforeSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional();
const unavailable = () => new SupportError(503, 'SUPPORT_UNAVAILABLE', 'Support is temporarily unavailable. Please try again shortly.');

async function messageInput(c: Context, uploadsAllowed: boolean) {
  if (c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'multipart/form-data') {
    try { return { fields: await c.req.json(), image: undefined }; } catch { throw supportInvalid(); }
  }
  if (!uploadsAllowed) throw supportForbidden();
  let form: FormData;
  try { form = await c.req.formData(); } catch { throw supportInvalid(); }
  const fields: Record<string, string> = {};
  let image: File | undefined;
  const seen = new Set<string>();
  for (const [name, value] of form.entries()) {
    if (seen.has(name)) throw new SupportError(400, 'SUPPORT_IMAGE_INVALID', 'Attach only one image per message.');
    seen.add(name);
    if (name === 'image' && typeof value !== 'string') image = value;
    else if (typeof value === 'string' && ['clientTicketId', 'clientMessageId', 'subject', 'message', 'preferredLanguage'].includes(name)) fields[name] = value;
    else throw supportInvalid();
  }
  fields.message ??= '';
  return { fields, image };
}

/** Installed behind the existing session, Origin, CSRF, and administrator middleware. */
export function installSupportRoutes(app: Hono<any>, options: SupportRoutesOptions) {
  const { store, realtime } = options;
  const success = (c: Context, data: unknown) => c.json({ ok: true, data, requestId: c.get('requestId') });
  const actor = (c: Context, admin: boolean): SupportActor => ({ ...options.actor(c), admin });
  const ticketId = (c: Context) => idSchema.parse(c.req.param('id'));
  const publish = async (event: SupportEvent, ownerId: string | undefined) => {
    // Even an injected delivery implementation must not turn a committed write into a failed send.
    await realtime.publish(event, { admins: true, ownerId }).catch(() => {});
  };
  const writing = async (c: Context) => {
    if (await options.rateLimit(c)) throw new SupportError(429, 'SUPPORT_RATE_LIMITED', 'You are sending messages too quickly. Please wait a moment.');
  };

  for (const admin of [false, true]) {
    const prefix = admin ? '/portal/v1/admin/support' : '/portal/v1/support';
    app.use(`${prefix}/*`, async (c, next) => { if (!store.configured && c.req.path !== '/portal/v1/admin/support/health') throw unavailable(); await next(); });
    app.get(`${prefix}/tickets`, async c => success(c, await store.list(actor(c, admin), supportListSchema.parse(c.req.query()))));
    app.get(`${prefix}/tickets/:id`, async c => success(c, await store.detail(actor(c, admin), ticketId(c), beforeSchema.parse(c.req.query('before')))));
    app.patch(`${prefix}/tickets/:id`, async c => {
      if (!admin) throw supportForbidden();
      const input = supportStatusSchema.parse(await c.req.json());
      const id = ticketId(c);
      const result = await store.setStatus(actor(c, admin), id, input.status);
      if (result.changed) await publish({ type: 'tickets', ticketId: id }, result.ownerId);
      return success(c, { status: input.status });
    });
    if (!admin) app.post(`${prefix}/tickets`, async c => {
      await writing(c);
      const parsed = await messageInput(c, !options.actor(c).admin);
      const input = supportCreateSchema.parse(parsed.fields);
      const image = parsed.image ? await prepareSupportImage(parsed.image) : undefined;
      const result = await store.create(actor(c, false), input, image);
      if (result.created) await publish({ type: 'message', ticketId: result.ticket.id, message: result.message }, result.ownerId);
      return success(c, { ticket: result.ticket, message: result.message });
    });
    app.post(`${prefix}/tickets/:id/messages`, async c => {
      await writing(c);
      const id = ticketId(c);
      const parsed = await messageInput(c, !admin && !options.actor(c).admin);
      const input = supportReplySchema.parse(parsed.fields);
      // Reject inaccessible tickets before any native image decoding takes place.
      if (parsed.image) await store.detail(actor(c, admin), id);
      const image = parsed.image ? await prepareSupportImage(parsed.image) : undefined;
      const result = await store.reply(actor(c, admin), id, input, image);
      if (result.created) await publish({ type: 'message', ticketId: id, message: result.message }, result.ownerId);
      return success(c, { ticket: result.ticket, message: result.message });
    });
    app.post(`${prefix}/tickets/:id/read`, async c => {
      const input = supportReadSchema.parse(await c.req.json());
      const id = ticketId(c);
      const result = await store.read(actor(c, admin), id, input.sequence);
      if (result.changed) await publish({ type: 'read', ticketId: id }, admin ? undefined : result.ownerId);
      return success(c, { read: true });
    });
    app.get(`${prefix}/presence`, async c => {
      try { return success(c, await realtime.presence(admin)); } catch { throw unavailable(); }
    });
    app.get(`${prefix}/events`, async c => {
      const person = actor(c, admin);
      let unsubscribe: (() => void) | undefined;
      let stopped = false;
      let finish = () => {};
      let emit: (event: SupportEvent) => void = () => {};
      const pending: SupportEvent[] = [];
      const close = () => { stopped = true; unsubscribe?.(); finish(); };
      // Register before returning ready so writes cannot race initial client loading.
      try {
        unsubscribe = await realtime.subscribe({ actorId: person.id, admin, sessionId: options.sessionId(c), receive: event => {
          if (stopped) return;
          if (pending.length >= 100) { close(); return; }
          pending.push(event); emit(event);
        }, close });
      } catch { throw unavailable(); }
      c.header('X-Accel-Buffering', 'no');
      c.header('Cache-Control', 'no-store, no-transform');
      return streamSSE(c, async stream => {
        let chain = Promise.resolve();
        let validating = false;
        const validate = async () => {
          try { return await options.validate(c, admin); } catch { return false; }
        };
        const drain = () => {
          chain = chain.then(async () => {
            if (stopped || !pending.length) return;
            if (!await validate()) { close(); return; }
            while (pending.length && !stopped) await stream.writeSSE({ event: 'support', data: JSON.stringify(pending.shift()) });
          }).catch(close);
        };
        emit = drain;
        stream.onAbort(close);
        c.req.raw.signal.addEventListener('abort', close, { once: true });
        if (c.req.raw.signal.aborted) close();
        const done = new Promise<void>(resolve => { finish = resolve; if (stopped) resolve(); });
        const timer = setInterval(() => {
          if (validating || stopped) return;
          validating = true;
          void validate().then(async valid => {
            if (!valid) { close(); return; }
            await stream.write(': keepalive\n\n');
          }).catch(close).finally(() => { validating = false; });
        }, options.validationIntervalMs ?? 15_000);
        timer.unref();
        try {
          if (!stopped) await stream.writeSSE({ event: 'support', data: JSON.stringify({ type: 'ready' }) });
          drain();
          await done;
        } finally { clearInterval(timer); c.req.raw.signal.removeEventListener('abort', close); close(); }
      });
    });
  }
  app.post('/portal/v1/support/welcome', async c => {
    const person = options.actor(c);
    if (person.admin) throw supportForbidden();
    const result = await store.ensureWelcome(person);
    // Only the winning request shows the dedicated notice; other tabs just refresh saved state.
    if (result.created) await publish({ type: 'tickets', ticketId: result.ticket.id }, result.ownerId);
    return success(c, { ticket: result.ticket, message: result.message, created: result.created });
  });
  app.post('/portal/v1/support/welcome/viewed', async c => {
    const person = options.actor(c);
    if (person.admin) throw supportForbidden();
    const result = await store.viewWelcome(person);
    if (result.changed) await publish({ type: 'tickets', ticketId: result.ticketId }, undefined);
    return success(c, { viewed: true });
  });
  app.get('/portal/v1/admin/support/welcome', async c => success(c, await store.welcomeList(actor(c, true), supportWelcomeListSchema.parse(c.req.query()))));
  app.get('/portal/v1/support/tickets/:id/messages/:messageId/image', async c => {
    const person = options.actor(c);
    if (person.admin && !await options.validate(c, true)) throw supportForbidden();
    const image = await store.image(person, ticketId(c), idSchema.parse(c.req.param('messageId')));
    c.header('Content-Type', image.mimeType);
    c.header('Content-Length', String(image.byteSize));
    c.header('Cache-Control', 'private, no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    return c.body(new Uint8Array(image.bytes));
  });
  app.patch('/portal/v1/admin/support/presence', async c => {
    const input = supportPresenceSchema.parse(await c.req.json());
    try { return success(c, await realtime.updatePresence(input)); } catch { throw unavailable(); }
  });
  app.post('/portal/v1/admin/support/heartbeat', async c => {
    const { tabId, active } = supportHeartbeatSchema.parse(await c.req.json());
    try { return success(c, await realtime.heartbeat(options.sessionId(c), tabId, active)); } catch { throw unavailable(); }
  });
  app.get('/portal/v1/admin/support/health', async c => {
    const [storage, live] = await Promise.all([store.health().then(() => true).catch(() => false), realtime.health().catch(() => false)]);
    return success(c, { configured: store.configured, storage, realtime: live });
  });
}
