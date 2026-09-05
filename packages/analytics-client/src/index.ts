import type { AnalyticsBootstrap, AnalyticsClientEvent } from '@kineticrouter/portal-contract';

type Page = { id: string; path: string; at: number; engagement: Map<string, number> };
type Queued = { event: AnalyticsClientEvent; attempts: number };
type Options = { consoleOrigin: string; surface: 'site' | 'console' };
const MAX_BYTES = 16 * 1024;
const DAY_MS = 86_400_000;
let singleton: Tracker | undefined;

export function startAnalytics(options: Options) {
  if (typeof window === 'undefined' || !globalThis.crypto?.randomUUID) return;
  singleton ??= new Tracker(options);
  return singleton;
}
export function analyticsIdentityChanged() { singleton?.identityChanged(); }
export function trackDocsCopy() { singleton?.action('docs_copy'); }

export function dateInTimezone(at: number, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)!.value).join('-');
}
/** Split visible intervals at reporting midnight without assuming a fixed UTC offset. */
export function splitEngagement(start: number, end: number, timezone: string): Array<{ day: string; ms: number }> {
  if (end <= start) return [];
  const result: Array<{ day: string; ms: number }> = [];
  let cursor = start;
  while (cursor < end) {
    const day = dateInTimezone(cursor, timezone);
    let boundary = end;
    if (dateInTimezone(end - 1, timezone) !== day) {
      let low = cursor + 1, high = end;
      while (low < high) { const middle = Math.floor((low + high) / 2); if (dateInTimezone(middle, timezone) === day) low = middle + 1; else high = middle; }
      boundary = low;
    }
    result.push({ day, ms: boundary - cursor }); cursor = boundary;
  }
  return result;
}

class Tracker {
  private readonly tabId = crypto.randomUUID();
  private readonly endpoint: string;
  private identity?: AnalyticsBootstrap;
  private bootstrapPromise?: Promise<void>;
  private queue: Queued[] = [];
  private page: Page;
  private documentPage: Page;
  private sessionId?: string;
  private visibleAt: number | null;
  private lastPresenceAt = 0;
  private nextAttemptAt = 0;
  private sending = false;
  private disabled = false;
  private sequence = 0;
  private authVersion = 0;
  private readonly acquisition: { referrer: string; source: string; medium: string; campaign: string };

  constructor(private readonly options: Options) {
    this.endpoint = `${options.consoleOrigin.replace(/\/$/, '')}/portal/v1/analytics`;
    const params = new URLSearchParams(location.search);
    let referrer = '';
    try { const parsed = new URL(document.referrer); if (/^https?:$/.test(parsed.protocol)) referrer = parsed.origin; } catch { /* Direct navigation. */ }
    this.acquisition = { referrer, source: (params.get('utm_source') ?? '').slice(0, 100), medium: (params.get('utm_medium') ?? '').slice(0, 100), campaign: (params.get('utm_campaign') ?? '').slice(0, 100) };
    this.page = this.newPage(location.pathname);
    this.documentPage = this.page;
    this.visibleAt = document.visibilityState === 'visible' ? Date.now() : null;
    this.push({ name: 'page_view' });
    void this.bootstrap().then(() => this.flush());
    window.setInterval(() => {
      if (document.visibilityState !== 'visible' || this.disabled) return;
      this.captureEngagement(); void this.flush();
    }, 10_000);
    document.addEventListener('visibilitychange', () => {
      this.captureEngagement();
      this.visibleAt = document.visibilityState === 'visible' ? Date.now() : null;
      if (this.visibleAt === null) this.beacon();
      else { void this.bootstrap().then(() => this.flush(true)); }
    });
    window.addEventListener('pagehide', () => { this.captureEngagement(); this.beacon(); });
    window.addEventListener('pageshow', event => { if (event.persisted) { this.page = this.newPage(location.pathname); this.documentPage = this.page; this.visibleAt = Date.now(); this.push({ name: 'page_view' }); void this.bootstrap().then(() => this.flush(true)); } });
    window.addEventListener('portal:analytics-identity', () => this.identityChanged());
    window.addEventListener('portal:analytics-docs-copy', () => this.action('docs_copy'));
    document.addEventListener('click', event => {
      if (this.options.surface !== 'site' || !(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>('a[href]'); if (!anchor) return;
      let destination: URL; try { destination = new URL(anchor.href, location.href); } catch { return; }
      if ((destination.origin === location.origin && ['/account/sign-in', '/account/sign-up'].includes(destination.pathname)) || (destination.origin === options.consoleOrigin && ['/sign-in', '/api-keys', '/dashboard'].includes(destination.pathname))) { this.action('cta_click'); this.beacon(); }
    }, { capture: true });
    const loadVitals = () => {
      if (this.disabled) return;
      void import('web-vitals').then(({ onLCP, onINP, onCLS }) => {
        const report = (metric: { name: string; id: string; value: number }) => {
          if (!['LCP', 'INP', 'CLS'].includes(metric.name)) return;
          this.push({ name: 'web_vital', metric: metric.name as 'LCP' | 'INP' | 'CLS', metricId: metric.id, value: metric.value }, this.documentPage);
          if (document.visibilityState === 'hidden') this.beacon();
        };
        onLCP(report); onINP(report); onCLS(report);
      }).catch(() => {});
    };
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(loadVitals, { timeout: 3000 }); else globalThis.setTimeout(loadVitals, 1500);
  }
  private newPage(path: string): Page { return { id: crypto.randomUUID(), path: path.split(/[?#]/)[0]!.slice(0, 512), at: Date.now(), engagement: new Map() }; }
  navigate(path: string) {
    if (path === this.page.path) return;
    this.captureEngagement();
    this.page = this.newPage(path); this.visibleAt = document.visibilityState === 'visible' ? Date.now() : null;
    if (path !== '/analytics') this.push({ name: 'page_view' });
    void this.flush(true);
  }
  identityChanged() {
    this.authVersion++; this.identity = undefined; this.disabled = false; this.nextAttemptAt = 0;
    void this.bootstrap().then(() => this.flush(true));
  }
  action(name: 'cta_click' | 'docs_copy') { this.push({ name }); }
  private push(value: Pick<AnalyticsClientEvent, 'name'> & Partial<AnalyticsClientEvent>, page = this.page) {
    if (this.disabled || page.path === '/analytics') return;
    const event: AnalyticsClientEvent = { id: crypto.randomUUID(), pageId: page.id, at: Date.now(), path: page.path, ...value };
    if (event.name === 'engagement') {
      const old = this.queue.find(item => item.event.name === 'engagement' && item.event.pageId === event.pageId && item.event.day === event.day);
      if (old) { old.event = event; return; }
    }
    if (this.queue.length >= 100) this.queue.shift();
    this.queue.push({ event, attempts: 0 });
    if (this.queue.length >= 20) void this.flush();
  }
  private captureEngagement() {
    const now = Date.now();
    if (this.visibleAt !== null && !this.disabled) {
      // A suspended device must not turn hours of sleep into foreground engagement.
      const from = Math.max(this.visibleAt, now - 30_000);
      for (const { day, ms } of splitEngagement(from, now, this.identity?.timezone ?? 'Asia/Kolkata')) {
        const cumulative = Math.min(DAY_MS, (this.page.engagement.get(day) ?? 0) + ms);
        this.page.engagement.set(day, cumulative); this.push({ name: 'engagement', day, engagementMs: cumulative });
      }
    }
    this.visibleAt = document.visibilityState === 'visible' ? now : null;
  }
  private async bootstrap(): Promise<void> {
    if (this.bootstrapPromise) { await this.bootstrapPromise; if (!this.identity && !this.disabled && Date.now() >= this.nextAttemptAt) return this.bootstrap(); return; }
    if (this.disabled || Date.now() < this.nextAttemptAt || (this.identity?.expiresAt ?? 0) > Date.now() + 10_000) return;
    const version = this.authVersion;
    this.bootstrapPromise = (async () => {
      try {
        const response = await fetch(`${this.endpoint}/bootstrap`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ tabId: this.tabId, ...this.acquisition }), signal: AbortSignal.timeout(4000) });
        if (!response.ok) throw new Error('Analytics unavailable');
        const payload = await response.json() as { ok: boolean; data: AnalyticsBootstrap };
        if (version !== this.authVersion || !payload.ok) return;
        if (!payload.data.enabled) { this.disabled = true; this.queue = []; return; }
        const oldSession = this.sessionId;
        this.identity = payload.data;
        this.sessionId = payload.data.sessionId;
        if (oldSession && oldSession !== this.identity.sessionId) {
          this.queue = []; this.page = this.newPage(location.pathname); this.documentPage = this.newPage(this.documentPage.path); this.visibleAt = document.visibilityState === 'visible' ? Date.now() : null; this.push({ name: 'page_view' });
        }
      } catch { this.nextAttemptAt = Date.now() + 30_000; }
    })();
    try { await this.bootstrapPromise; } finally { this.bootstrapPromise = undefined; }
  }
  private payload(items: Queued[]) {
    return JSON.stringify({ token: this.identity!.token, tabId: this.tabId, path: this.page.path, visible: document.visibilityState === 'visible', sentAt: Date.now(), sequence: ++this.sequence, events: items.map(item => item.event) });
  }
  private takeBatch() {
    const batch: Queued[] = [];
    while (this.queue.length && batch.length < 20) {
      const next = this.queue[0]!;
      if (next.event.at < Date.now() - DAY_MS || next.attempts >= 3) { this.queue.shift(); continue; }
      if (new TextEncoder().encode(this.payload([...batch, next])).length >= MAX_BYTES) break;
      batch.push(this.queue.shift()!);
    }
    return batch;
  }
  private async flush(force = false) {
    if (this.sending || this.disabled || Date.now() < this.nextAttemptAt) return;
    await this.bootstrap();
    if (!this.identity?.token || (this.identity.expiresAt ?? 0) <= Date.now() || this.sending) return;
    const hasActions = this.queue.some(item => item.event.name !== 'engagement');
    if (!force && !hasActions && Date.now() - this.lastPresenceAt < 30_000) return;
    this.sending = true;
    const batch = this.takeBatch();
    try {
      const response = await fetch(`${this.endpoint}/collect`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: this.payload(batch), keepalive: true, signal: AbortSignal.timeout(5000) });
      if (response.status === 401) { this.identity = undefined; throw new Error('Refresh identity'); }
      if (!response.ok) { if (response.status === 400 || response.status === 403 || response.status === 413) return; throw new Error('Retry analytics'); }
      this.lastPresenceAt = Date.now(); this.nextAttemptAt = 0;
    } catch {
      batch.forEach(item => item.attempts++);
      this.queue = [...batch.filter(item => item.attempts < 3), ...this.queue].slice(-100);
      this.nextAttemptAt = Date.now() + Math.min(30_000, 5000 * (batch[0]?.attempts ?? 1));
    } finally { this.sending = false; }
  }
  private beacon() {
    if (this.disabled || !this.identity?.token || (this.identity.expiresAt ?? 0) <= Date.now()) return;
    const batch = this.takeBatch(); const body = this.payload(batch);
    if (!navigator.sendBeacon?.(`${this.endpoint}/collect`, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) {
      this.queue = [...batch, ...this.queue].slice(-100); void this.flush(true);
    }
  }
}
