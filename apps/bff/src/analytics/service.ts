import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { getConnInfo } from '@hono/node-server/conninfo';
import { analyticsBootstrapSchema, analyticsCollectSchema, analyticsQuerySchema, type AnalyticsAction, type AnalyticsLive, type AnalyticsQuery, type AnalyticsScope, type AnalyticsSurface, type PortalUser } from '@kineticrouter/portal-contract';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { MemoryAnalyticsStore } from './memory-store.js';
import { PostgresAnalyticsStore } from './postgres-store.js';
import { DAY_MS, analyticsDay, normalizePath, retentionDay, type Acquisition, type AnalyticsStore, type ReportKind, type StoredEvent } from './model.js';

const ACTIVE_MS = 90_000;
const TOKEN_MS = 5 * 60_000;
const visitorCookie = 'kr_analytics_visitor';
const legacyDisabledCookie = 'kr_analytics_disabled';
type Identity = { visitorId: string; sessionId: string; tabId: string; origin: string; auth: string; userId?: string; username?: string; device: string; expiresAt: number };
type Presence = Identity & { surface: AnalyticsSurface; path: string; at: number; eventAt: number; visible: boolean };
type Observation = { userId: string; at: number };
type Pending = { events: StoredEvent[]; observations: Observation[]; resolve(): void; reject(error: unknown): void };
type ServiceOptions = { store?: AnalyticsStore; enabled?: boolean; now?: () => number; identify(cookie: string): Promise<PortalUser | undefined> };

export class AnalyticsService {
  readonly store: AnalyticsStore;
  readonly enabled: boolean;
  readonly publicApp = new Hono();
  private readonly now: () => number;
  private readonly presence = new Map<string, Presence>();
  private readonly rate = new Map<string, { count: number; until: number }>();
  private readonly revoked = new Map<string, number>();
  private readonly cache = new Map<string, { until: number; value: Promise<unknown> }>();
  private pending: Pending[] = [];
  private pendingEvents = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private maintenance: ReturnType<typeof setInterval>;
  private flushing?: Promise<void>;
  private maintenanceRunning = false;
  private closed = false;
  readonly health: AnalyticsLive['health'];

  constructor(options: ServiceOptions) {
    this.now = options.now ?? Date.now;
    this.enabled = options.enabled ?? (config.analyticsEnabled && (!config.production || Boolean(config.analyticsDatabaseUrl)));
    this.store = options.store ?? (config.analyticsDatabaseUrl ? new PostgresAnalyticsStore(config.analyticsDatabaseUrl, config.serverTimezone) : new MemoryAnalyticsStore(config.serverTimezone));
    this.health = { collected: 0, rejected: 0, dropped: 0, lastEventAt: null, storageAvailable: this.store.kind === 'memory', presenceResetAt: new Date(this.now()).toISOString() };
    this.maintenance = setInterval(() => { void this.maintain(); }, 60_000);
    this.maintenance.unref();
    const app = this.publicApp;
    app.use('*', bodyLimit({ maxSize: 16 * 1024 }));
    app.use('*', async (c, next) => {
      const origin = c.req.header('origin');
      if (!origin || (origin !== config.portalOrigin && !config.publicSiteOrigins.includes(origin))) return this.failure(c, 403, 'ORIGIN_INVALID', 'The analytics origin is not allowed.');
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Access-Control-Allow-Credentials', 'true'); c.header('Vary', 'Origin');
      c.header('Cache-Control', 'no-store');
      await next();
    });
    app.options('*', c => {
      c.header('Access-Control-Allow-Methods', 'POST, OPTIONS'); c.header('Access-Control-Allow-Headers', 'Content-Type, Accept'); c.header('Access-Control-Max-Age', '600'); return c.body(null, 204);
    });
    app.post('/bootstrap', async c => {
      const input = analyticsBootstrapSchema.parse(await c.req.json());
      if (!this.allow(`bootstrap:${this.clientKey(c)}`, 2000)) return this.failure(c, 429, 'RATE_LIMITED', 'Analytics is busy.');
      const user = getCookie(c, config.sessionCookieName) ? await options.identify(getCookie(c, config.sessionCookieName)!).catch(() => undefined) : undefined;
      const disabled = user?.role === 'admin' || /bot|crawler|spider|headless|lighthouse/i.test(c.req.header('user-agent') ?? '');
      if (!this.enabled || disabled) {
        const id = this.readVisitor(c);
        if (id) for (const [key, item] of this.presence) if (item.visitorId === id) this.presence.delete(key);
        return c.json({ ok: true, data: { enabled: false, timezone: config.serverTimezone } });
      }
      let visitorId = this.readVisitor(c);
      if (!visitorId) { visitorId = randomUUID(); this.cookie(c, visitorCookie, this.sign(visitorId, 'visitor')); }
      if (getCookie(c, legacyDisabledCookie)) deleteCookie(c, legacyDisabledCookie, { httpOnly: true, secure: config.production, sameSite: 'Lax', path: '/' });
      const acquisition = this.acquisition(input, c.req.header('user-agent') ?? '');
      const session = await this.store.session(visitorId, acquisition, this.now());
      this.health.storageAvailable = true;
      const identity: Identity = { visitorId, sessionId: session.id, tabId: input.tabId, origin: c.req.header('origin')!, auth: this.authBinding(getCookie(c, config.sessionCookieName)), userId: user?.id, username: user?.username, device: acquisition.device, expiresAt: this.now() + TOKEN_MS };
      return c.json({ ok: true, data: { enabled: true, token: this.sign(JSON.stringify(identity), 'token'), expiresAt: identity.expiresAt, visitorId, sessionId: session.id, timezone: config.serverTimezone } });
    });
    app.post('/collect', async c => {
      if (!this.enabled) return c.body(null, 204);
      const input = analyticsCollectSchema.parse(await c.req.json());
      const identity = this.readIdentity(input.token);
      const binding = this.authBinding(getCookie(c, config.sessionCookieName));
      if (!identity || identity.tabId !== input.tabId || identity.origin !== c.req.header('origin') || identity.auth !== binding || this.revoked.has(binding) || identity.visitorId !== this.readVisitor(c)) return this.failure(c, 401, 'ANALYTICS_TOKEN_EXPIRED', 'Refresh analytics identity.');
      if (!this.allow(`collect:${identity.visitorId}:${identity.tabId}`, 120) || !this.allow(`ip:${this.clientKey(c)}`, 12_000)) return this.failure(c, 429, 'RATE_LIMITED', 'Analytics is busy.');
      const now = this.now();
      if (input.sentAt > now + 5000 || input.sentAt < now - DAY_MS) return this.failure(c, 400, 'INVALID_EVENT_TIME', 'Analytics events must be recent.');
      const surface = identity.origin === config.portalOrigin ? 'console' : 'site';
      const events: StoredEvent[] = [];
      const pageBindings = new Map<string, string>();
      for (const event of input.events) {
        if (event.at < now - DAY_MS || event.at > now + 5000 || (event.name === 'engagement' && (!event.day || ![analyticsDay(event.at, config.serverTimezone), analyticsDay(event.at - DAY_MS, config.serverTimezone)].includes(event.day)))) return this.failure(c, 400, 'INVALID_EVENT_TIME', 'Analytics events must be recent.');
        const path = normalizePath(event.path, surface);
        const oldPath = pageBindings.get(event.pageId);
        if (oldPath && oldPath !== path) return this.failure(c, 400, 'INVALID_PAGE', 'A page observation cannot change paths.');
        pageBindings.set(event.pageId, path);
        events.push({ ...event, engagementMs: event.name === 'engagement' ? event.engagementMs : undefined, path, day: event.name === 'engagement' ? event.day! : analyticsDay(event.at, config.serverTimezone), surface, visitorId: identity.visitorId, sessionId: identity.sessionId });
      }
      const key = `${identity.visitorId}:${identity.tabId}`;
      const previous = this.presence.get(key);
      // A delayed flush must not move the live visitor back to a previous page.
      const eventAt = input.sequence;
      if ((!previous || eventAt > previous.eventAt) && (this.presence.has(key) || this.presence.size < 10_000)) this.presence.set(key, { ...identity, surface, path: normalizePath(input.path, surface), at: Math.min(now, input.sentAt), eventAt, visible: input.visible });
      const observations: Observation[] = [];
      if (surface === 'console' && input.visible && identity.userId && now - input.sentAt <= 90_000 && !/bot|crawler|spider|headless|lighthouse/i.test(c.req.header('user-agent') ?? '')) {
        const current = await options.identify(getCookie(c, config.sessionCookieName) ?? '');
        if (current?.id === identity.userId && current.role === 'user' && current.status === 'active') observations.push({ userId: current.id, at: Math.min(now, input.sentAt) });
      }
      if (events.length || observations.length) await this.enqueue(events, observations);
      return c.body(null, 204);
    });
    app.onError((error, c) => {
      if (error instanceof HTTPException) { this.health.rejected++; return error.getResponse(); }
      if (error instanceof SyntaxError || (error && typeof error === 'object' && 'issues' in error)) return this.failure(c, 400, 'VALIDATION_ERROR', 'Invalid analytics payload.');
      this.health.storageAvailable = false;
      return this.failure(c, 503, 'ANALYTICS_UNAVAILABLE', 'Analytics is temporarily unavailable.');
    });
    if (this.enabled) void this.maintain();
  }
  private cookie(c: Context, name: string, value: string) { setCookie(c, name, value, { httpOnly: true, secure: config.production, sameSite: 'Lax', path: '/', maxAge: 395 * 24 * 60 * 60 }); }
  private sign(value: string, purpose: string) { const encoded = Buffer.from(value).toString('base64url'); return `${encoded}.${createHmac('sha256', config.sessionEncryptionKey).update(`analytics:${purpose}:${encoded}`).digest('base64url')}`; }
  private verify(value: string | undefined, purpose: string) {
    if (!value || value.length > 4096) return undefined;
    const [encoded, signature, extra] = value.split('.'); if (!encoded || !signature || extra) return undefined;
    const expected = this.sign(Buffer.from(encoded, 'base64url').toString(), purpose).split('.')[1]!;
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return undefined;
    return Buffer.from(encoded, 'base64url').toString();
  }
  private readVisitor(c: Context) { const value = this.verify(getCookie(c, visitorCookie), 'visitor'); return value && /^[0-9a-f-]{36}$/.test(value) ? value : undefined; }
  private readIdentity(token: string): Identity | undefined {
    try { const value = this.verify(token, 'token'); if (!value) return; const identity = JSON.parse(value) as Identity; if (identity.expiresAt <= this.now()) return; return identity; } catch { return; }
  }
  private authBinding(value?: string) { return createHmac('sha256', config.sessionEncryptionKey).update(`analytics:auth:${value ?? ''}`).digest('base64url'); }
  revokeSession(cookie: string) { const binding = this.authBinding(cookie); this.revoked.set(binding, this.now() + TOKEN_MS); for (const [key, item] of this.presence) if (item.auth === binding) this.presence.delete(key); }
  private clientKey(c: Context) {
    let address = 'unknown';
    try { address = getConnInfo(c).remote.address ?? address; } catch { /* Request fixtures have no socket. */ }
    if (config.trustProxy) address = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? address;
    return createHmac('sha256', config.sessionEncryptionKey).update(address).digest('hex').slice(0, 20);
  }
  private allow(key: string, maximum: number) {
    const old = this.rate.get(key); const now = this.now();
    if (!old || old.until <= now) {
      if (!old && this.rate.size >= 20_000) return false;
      this.rate.set(key, { count: 1, until: now + 60_000 }); return true;
    }
    old.count++; return old.count <= maximum;
  }
  private acquisition(input: { referrer: string; source: string; medium: string; campaign: string }, ua: string): Acquisition {
    let referrer = '';
    try { const parsed = new URL(input.referrer); if (/^https?:$/.test(parsed.protocol) && ![config.portalOrigin, ...config.publicSiteOrigins].some(origin => new URL(origin).hostname === parsed.hostname)) referrer = parsed.hostname.slice(0, 100); } catch { /* Direct navigation. */ }
    const clean = (value: string) => /^[a-zA-Z0-9 ._/-]{0,100}$/.test(value) ? value : '';
    input.source = clean(input.source) || referrer;
    input.medium = clean(input.medium) || (referrer ? (/^(www\.)?(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com)$/.test(referrer) ? 'organic' : 'referral') : '');
    return { referrer, source: clean(input.source), medium: clean(input.medium), campaign: clean(input.campaign), device: /ipad|tablet/i.test(ua) ? 'Tablet' : /mobile|iphone|android/i.test(ua) ? 'Mobile' : 'Desktop', browser: /edg\//i.test(ua) ? 'Edge' : /firefox|fxios/i.test(ua) ? 'Firefox' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : 'Other', os: /iphone|ipad/i.test(ua) ? 'iOS' : /android/i.test(ua) ? 'Android' : /windows/i.test(ua) ? 'Windows' : /mac os|macintosh/i.test(ua) ? 'macOS' : /linux/i.test(ua) ? 'Linux' : 'Other' };
  }
  private failure(c: Context, status: 400 | 401 | 403 | 429 | 503, code: string, message: string) { this.health.rejected++; return c.json({ ok: false, error: { code, message } }, status); }
  private enqueue(events: StoredEvent[], observations: Observation[] = []) {
    const weight = events.length + observations.length;
    if (this.closed || this.pendingEvents + weight > 5000) { this.health.dropped += weight; return Promise.reject(new Error('Analytics queue full.')); }
    return new Promise<void>((resolve, reject) => {
      this.pending.push({ events, observations, resolve, reject }); this.pendingEvents += weight;
      if (!this.timer && !this.flushing) this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, 75);
    });
  }
  private async flush() {
    if (this.flushing) return this.flushing;
    const batch: Pending[] = []; let count = 0;
    while (this.pending.length && count < 500) { const item = this.pending.shift()!; batch.push(item); count += item.events.length + item.observations.length; }
    if (!batch.length) return;
    this.pendingEvents -= count;
    this.flushing = (async () => {
      try {
        await this.store.write(batch.flatMap(item => item.events), batch.flatMap(item => item.observations)); this.health.storageAvailable = true;
        this.health.collected += count; this.health.lastEventAt = new Date(this.now()).toISOString(); batch.forEach(item => item.resolve());
      } catch (error) { this.health.storageAvailable = false; this.health.dropped += count; batch.forEach(item => item.reject(error)); }
    })();
    await this.flushing; this.flushing = undefined;
    if (this.pending.length) void this.flush();
  }
  recordAction(c: Context, user: PortalUser, name: Exclude<AnalyticsAction, 'cta_click' | 'docs_copy'>, path: string) {
    if (!this.enabled || user.role === 'admin') return;
    const visitorId = this.readVisitor(c); if (!visitorId) return;
    const now = this.now();
    void (async () => {
      const session = await this.store.session(visitorId, this.acquisition({ referrer: '', source: '', medium: '', campaign: '' }, c.req.header('user-agent') ?? ''), now);
      await this.enqueue([{ id: randomUUID(), pageId: randomUUID(), at: now, day: analyticsDay(now, config.serverTimezone), path, name, visitorId, sessionId: session.id, surface: 'console' }]);
    })().catch(() => { this.health.storageAvailable = false; });
  }
  live(surface: AnalyticsScope, page: number, pageSize: number): AnalyticsLive {
    const now = this.now();
    const active = [...this.presence.values()].filter(item => item.visible && now - item.at < ACTIVE_MS && (surface === 'all' || item.surface === surface));
    const groups = new Map<string, Presence[]>(); const paths = new Map<string, Presence[]>();
    for (const item of active) {
      const identityKey = item.userId ? `user:${item.userId}` : `visitor:${item.visitorId}`;
      const group = groups.get(identityKey);
      if (group) group.push(item); else groups.set(identityKey, [item]);
      const pathKey = `${item.surface}:${item.path}`;
      const path = paths.get(pathKey);
      if (path) path.push(item); else paths.set(pathKey, [item]);
    }
    const rows = [...groups].map(([id, items]) => {
      const latest = items.sort((a, b) => b.at - a.at)[0]!;
      return { id, label: latest.username || `Visitor ${latest.visitorId.slice(0, 8)}`, authenticated: Boolean(latest.userId), surface: latest.surface, path: latest.path, device: latest.device, lastSeen: new Date(latest.at).toISOString(), tabs: items.length };
    }).sort((a, b) => Number(b.authenticated) - Number(a.authenticated) || b.lastSeen.localeCompare(a.lastSeen));
    return { generatedAt: new Date(now).toISOString(), activeWindowSeconds: ACTIVE_MS / 1000, visitors: new Set(active.map(i => i.visitorId)).size, customers: new Set(active.flatMap(i => i.userId ? [i.userId] : [])).size, activeTabs: active.length, items: rows.slice((page - 1) * pageSize, page * pageSize), pages: [...paths.values()].map(items => ({ surface: items[0]!.surface, path: items[0]!.path, visitors: new Set(items.map(i => i.visitorId)).size, tabs: items.length })).sort((a, b) => b.visitors - a.visitors).slice(0, 100), total: rows.length, page, pageSize, health: { ...this.health } };
  }
  async report(kind: ReportKind, input: Record<string, string>) {
    if (!this.enabled) throw new Error('Analytics collection is disabled or its database is not configured.');
    const query: AnalyticsQuery = analyticsQuerySchema.parse(input);
    if (query.startDate < retentionDay(this.now(), config.serverTimezone) || query.endDate > analyticsDay(this.now(), config.serverTimezone)) throw new RangeError('Choose dates within the retained history, ending no later than today.');
    const key = `${kind}:${JSON.stringify(query)}`;
    const cached = this.cache.get(key); if (cached && cached.until > this.now()) return cached.value;
    const value = this.store.report(kind, query, this.now()).then(result => { this.health.storageAvailable = true; return result; }).catch(error => { this.cache.delete(key); this.health.storageAvailable = false; throw error; });
    if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { until: this.now() + 60_000, value }); return value;
  }
  private async maintain() {
    const now = this.now();
    for (const [key, item] of this.presence) if (now - item.at >= ACTIVE_MS) this.presence.delete(key);
    for (const [key, item] of this.rate) if (item.until <= now) this.rate.delete(key);
    for (const [key, until] of this.revoked) if (until <= now) this.revoked.delete(key);
    for (const [key, item] of this.cache) if (item.until <= now) this.cache.delete(key);
    if (!this.enabled || this.maintenanceRunning) return;
    this.maintenanceRunning = true;
    try { await this.store.maintain(now); this.health.storageAvailable = true; }
    catch { this.health.storageAvailable = false; logger.warn('Analytics maintenance unavailable; account services are unaffected'); }
    finally { this.maintenanceRunning = false; }
  }
  async close() {
    this.closed = true; clearInterval(this.maintenance); if (this.timer) clearTimeout(this.timer);
    if (this.flushing) await this.flushing;
    while (this.pending.length) await this.flush();
    await this.store.close();
  }
}
