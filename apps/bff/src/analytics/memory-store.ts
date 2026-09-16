import { randomUUID } from 'node:crypto';
import { localHour } from '../metrics/time.js';
import type { CustomerActivityObservation, CustomerHour } from './model.js';
import type { AnalyticsAcquisition, AnalyticsActions, AnalyticsOverview, AnalyticsPages, AnalyticsPerformance, AnalyticsQuery, AnalyticsTotals } from '@kineticrouter/portal-contract';
import { ACTIONS, DAY_MS, SESSION_MS, analyticsDay, metricRating, previousRange, retentionDay, type Acquisition, type AnalyticsSession, type AnalyticsStore, type PageFact, type ReportKind, type StoredEvent } from './model.js';

/** Development/test store. Production uses PostgreSQL; memory history is deliberately bounded. */
export class MemoryAnalyticsStore implements AnalyticsStore {
  readonly kind = 'memory' as const;
  readonly sessions = new Map<string, AnalyticsSession>();
  readonly facts = new Map<string, PageFact>();
  readonly events = new Map<string, StoredEvent>();
  readonly actions = new Map<string, StoredEvent>();
  readonly vitals = new Map<string, StoredEvent>();
  readonly customerHours = new Map<string, CustomerHour>();
  private customerCoverage?: number;
  private visitors = new Map<string, { firstSeen: number; current: string }>();
  constructor(readonly timezone = 'Asia/Kolkata') {}

  async session(visitorId: string, acquisition: Acquisition, now: number) {
    const visitor = this.visitors.get(visitorId);
    const previous = visitor && this.sessions.get(visitor.current);
    if (previous && now - previous.lastSeen < SESSION_MS) return previous;
    const session: AnalyticsSession = { ...acquisition, id: randomUUID(), visitorId, startedAt: now, lastSeen: now, firstSeen: visitor?.firstSeen ?? now };
    this.sessions.set(session.id, session);
    this.visitors.set(visitorId, { firstSeen: session.firstSeen, current: session.id });
    if (this.sessions.size > 100_000) throw new Error('Development analytics capacity reached.');
    return session;
  }

  async write(events: StoredEvent[], observations: CustomerActivityObservation[] = []) {
    const newKeys = new Set(observations.map(row => `${localHour(row.at, this.timezone)}:${row.userId}`).filter(key => !this.customerHours.has(key)));
    if (this.customerHours.size + newKeys.size > 250_000) throw new Error('Development activity capacity reached.');
    if (this.facts.size + this.events.size > 250_000) throw new Error('Development analytics capacity reached.');
    for (const observation of observations) {
      this.customerCoverage = Math.min(this.customerCoverage ?? observation.at, observation.at);
      const period = localHour(observation.at, this.timezone), key = `${period}:${observation.userId}`;
      const old = this.customerHours.get(key);
      this.customerHours.set(key, { userId: observation.userId, period, firstSeen: Math.min(old?.firstSeen ?? observation.at, observation.at), lastSeen: Math.max(old?.lastSeen ?? observation.at, observation.at) });
    }
    for (const event of events) {
      const session = this.sessions.get(event.sessionId);
      if (!session || session.visitorId !== event.visitorId) continue;
      if (this.events.has(event.id)) continue;
      if (event.name !== 'engagement') this.events.set(event.id, event);
      session.lastSeen = Math.max(session.lastSeen, event.at);
      session.startedAt = Math.min(session.startedAt, event.at);
      const visitor = this.visitors.get(event.visitorId);
      if (visitor) visitor.firstSeen = Math.min(visitor.firstSeen, event.at);
      const key = `${event.pageId}:${event.day}`;
      let fact = this.facts.get(key);
      if (fact && (fact.sessionId !== event.sessionId || fact.path !== event.path || fact.surface !== event.surface)) continue;
      if (!fact) {
        fact = { pageId: event.pageId, day: event.day, sessionId: event.sessionId, visitorId: event.visitorId, surface: event.surface, path: event.path, at: event.at, views: 0, engagementMs: 0 };
        this.facts.set(key, fact);
      }
      if (event.name === 'page_view') {
        fact.views = 1;
        fact.at = Math.min(fact.at, event.at);
        const order = `${String(event.at).padStart(15, '0')}:${event.pageId}`;
        const entryOrder = `${String(session.entryAt ?? Infinity).padStart(15, '0')}:${session.entryId}`;
        const exitOrder = `${String(session.exitAt ?? 0).padStart(15, '0')}:${session.exitId}`;
        if (!session.entryPath || order < entryOrder) Object.assign(session, { entryPath: event.path, entrySurface: event.surface, entryAt: event.at, entryId: event.pageId });
        if (!session.exitPath || order > exitOrder) Object.assign(session, { exitPath: event.path, exitSurface: event.surface, exitAt: event.at, exitId: event.pageId });
      }
      if (event.name === 'engagement') fact.engagementMs = Math.max(fact.engagementMs, event.engagementMs ?? 0);
      if (ACTIONS.includes(event.name as typeof ACTIONS[number])) this.actions.set(event.id, event);
      if (event.name === 'web_vital') {
        const vitalKey = `${event.pageId}:${event.metric}:${event.metricId}`;
        const old = this.vitals.get(vitalKey);
        if (!old || event.at >= old.at) this.vitals.set(vitalKey, event);
      }
    }
  }

  async report(kind: ReportKind, query: AnalyticsQuery, now: number) {
    if (kind === 'overview') {
      const previous = previousRange(query);
      const result: AnalyticsOverview = {
        generatedAt: new Date(now).toISOString(), timezone: this.timezone, storage: this.kind,
        range: { startDate: query.startDate, endDate: query.endDate, previousStartDate: previous.startDate, previousEndDate: previous.endDate, comparisonAvailable: previous.startDate >= retentionDay(now, this.timezone) },
        totals: this.totals(query), previous: this.totals(previous), trend: [],
      };
      const daily = new Map<string, { visitors: Set<string>; sessions: Set<string>; pageviews: number }>();
      for (const fact of this.scoped(query)) {
        let day = daily.get(fact.day);
        if (!day) { day = { visitors: new Set(), sessions: new Set(), pageviews: 0 }; daily.set(fact.day, day); }
        day.visitors.add(fact.visitorId); day.sessions.add(fact.sessionId); day.pageviews += fact.views;
      }
      for (let at = Date.parse(query.startDate); at <= Date.parse(query.endDate); at += DAY_MS) {
        const date = new Date(at).toISOString().slice(0, 10);
        const day = daily.get(date);
        result.trend.push({ date, visitors: day?.visitors.size ?? 0, sessions: day?.sessions.size ?? 0, pageviews: day?.pageviews ?? 0 });
      }
      return result;
    }
    const facts = this.scoped(query);
    const sessionIds = new Set(facts.map(fact => fact.sessionId));
    const sessions = [...sessionIds].map(id => this.sessions.get(id)!);
    if (kind === 'pages') {
      const groups = new Map<string, PageFact[]>();
      for (const fact of facts) {
        const key = `${fact.surface}:${fact.path}`, group = groups.get(key);
        if (group) group.push(fact); else groups.set(key, [fact]);
      }
      const entrances = new Map<string, number>(), exits = new Map<string, number>();
      for (const session of sessions) {
        if (session.entryAt !== undefined && this.inRange(analyticsDay(session.entryAt, this.timezone), query)) {
          const key = `${session.entrySurface}:${session.entryPath}`; entrances.set(key, (entrances.get(key) ?? 0) + 1);
        }
        if (session.exitAt !== undefined && this.inRange(analyticsDay(session.exitAt, this.timezone), query)) {
          const key = `${session.exitSurface}:${session.exitPath}`; exits.set(key, (exits.get(key) ?? 0) + 1);
        }
      }
      const items = [...groups].map(([key, rows]) => {
        const first = rows[0]!;
        return { surface: first.surface, path: first.path, visitors: new Set(rows.map(r => r.visitorId)).size, pageviews: rows.reduce((sum, r) => sum + r.views, 0), engagementMs: rows.reduce((sum, r) => sum + r.engagementMs, 0),
          entrances: entrances.get(key) ?? 0, exits: exits.get(key) ?? 0 };
      }).sort((a, b) => b.pageviews - a.pageviews || a.path.localeCompare(b.path));
      return { items: items.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), total: items.length, page: query.page, pageSize: query.pageSize } satisfies AnalyticsPages;
    }
    if (kind === 'acquisition') {
      const breakdown = (key: keyof Acquisition) => {
        const grouped = new Map<string, AnalyticsSession[]>();
        for (const session of sessions) {
          const label = key === 'source' ? `${session.source || 'direct'} / ${session.medium || 'none'}` : session[key] || (key === 'referrer' ? 'Direct' : 'Unspecified');
          const group = grouped.get(label);
          if (group) group.push(session); else grouped.set(label, [session]);
        }
        return [...grouped].map(([label, rows]) => ({ label, sessions: rows.length, visitors: new Set(rows.map(r => r.visitorId)).size })).sort((a, b) => b.sessions - a.sessions).slice(0, 100);
      };
      return { referrers: breakdown('referrer'), sources: breakdown('source'), campaigns: breakdown('campaign'), devices: breakdown('device'), browsers: breakdown('browser'), operatingSystems: breakdown('os') } satisfies AnalyticsAcquisition;
    }
    if (kind === 'actions') {
      const events = [...this.actions.values()].filter(event => this.matches(event, query));
      const bySession = new Map<string, StoredEvent[]>();
      const counts = new Map<string, { count: number; sessions: Set<string> }>();
      for (const event of events) {
        const group = bySession.get(event.sessionId);
        if (group) group.push(event); else bySession.set(event.sessionId, [event]);
        let action = counts.get(event.name);
        if (!action) { action = { count: 0, sessions: new Set() }; counts.set(event.name, action); }
        action.count++; action.sessions.add(event.sessionId);
      }
      let clicked = 0, signedIn = 0, created = 0;
      for (const group of bySession.values()) {
        const stepOrder = ['cta_click', 'sign_in', 'api_key_created'];
        const ordered = group.sort((a, b) => a.at - b.at || stepOrder.indexOf(a.name) - stepOrder.indexOf(b.name));
        let stage = 0;
        for (const event of ordered) {
          if (stage === 0 && event.name === 'cta_click') stage = 1;
          else if (stage === 1 && event.name === 'sign_in') stage = 2;
          else if (stage === 2 && event.name === 'api_key_created') stage = 3;
        }
        if (stage >= 1) clicked++; if (stage >= 2) signedIn++; if (stage >= 3) created++;
      }
      return { actions: ACTIONS.map(name => ({ name, count: counts.get(name)?.count ?? 0, sessions: counts.get(name)?.sessions.size ?? 0 })), funnelAvailable: query.surface === 'all', funnel: [{ name: 'Console CTA', sessions: clicked }, { name: 'Signed in', sessions: signedIn }, { name: 'API key created', sessions: created }] } satisfies AnalyticsActions;
    }
    const groups = new Map<string, StoredEvent[]>();
    for (const event of this.vitals.values()) if (this.matches(event, query)) {
      const key = `${event.surface}:${event.path}:${event.metric}`, group = groups.get(key);
      if (group) group.push(event); else groups.set(key, [event]);
    }
    return { estimated: false, items: [...groups.values()].map(rows => {
      const first = rows[0]!; const values = rows.map(e => e.value!).sort((a, b) => a - b);
      const p75 = values[Math.ceil(values.length * .75) - 1]!;
      return { surface: first.surface, path: first.path, metric: first.metric!, p75, samples: rows.length, rating: metricRating(first.metric!, p75) };
    }).sort((a, b) => b.samples - a.samples).slice(0, 100) } satisfies AnalyticsPerformance;
  }

  private inRange(day: string, query: AnalyticsQuery) { return day >= query.startDate && day <= query.endDate; }
  private matches(event: { day: string; surface: string; path: string }, query: AnalyticsQuery) { return this.inRange(event.day, query) && (query.surface === 'all' || event.surface === query.surface) && (!query.search || event.path.toLowerCase().includes(query.search.toLowerCase())); }
  private scoped(query: AnalyticsQuery) { return [...this.facts.values()].filter(fact => this.matches(fact, query)); }
  private totals(query: AnalyticsQuery): AnalyticsTotals {
    const facts = this.scoped(query);
    const visitors = new Set(facts.map(f => f.visitorId));
    const sessions = new Map<string, { views: number; engagement: number }>();
    let views = 0, engagement = 0;
    for (const fact of facts) {
      let session = sessions.get(fact.sessionId);
      if (!session) { session = { views: 0, engagement: 0 }; sessions.set(fact.sessionId, session); }
      session.views += fact.views; session.engagement += fact.engagementMs;
      views += fact.views; engagement += fact.engagementMs;
    }
    const successful = new Set([...this.actions.values()].filter(e => ['sign_in', 'api_key_created', 'redemption'].includes(e.name) && this.matches(e, query)).map(e => e.sessionId));
    let engaged = 0;
    for (const [id, session] of sessions) if (successful.has(id) || session.views >= 2 || session.engagement >= 10_000) engaged++;
    const newVisitors = [...visitors].filter(id => { const v = this.visitors.get(id); return v && analyticsDay(v.firstSeen, this.timezone) >= query.startDate; }).length;
    const engagementRate = sessions.size ? engaged / sessions.size * 100 : 0;
    return { visitors: visitors.size, sessions: sessions.size, pageviews: views, newVisitors, returningVisitors: visitors.size - newVisitors, engagementRate, bounceRate: sessions.size ? 100 - engagementRate : 0, averageEngagementMs: sessions.size ? engagement / sessions.size : 0 };
  }

  async maintain(now: number) {
    this.customerCoverage ??= now;
    const cutoff = retentionDay(now, this.timezone);
    for (const [key, value] of this.customerHours) if (value.period.slice(0, 10) < cutoff) this.customerHours.delete(key);
    for (const [key, event] of this.events) if (event.at < now - 90 * DAY_MS) this.events.delete(key);
    for (const map of [this.facts, this.actions, this.vitals]) for (const [key, value] of map) if (value.day < cutoff) map.delete(key);
    const used = new Set([...this.facts.values()].map(f => f.sessionId));
    for (const [id, session] of this.sessions) if (!used.has(id) && analyticsDay(session.lastSeen, this.timezone) < cutoff) this.sessions.delete(id);
    for (const [id, visitor] of this.visitors) if (!this.sessions.has(visitor.current)) this.visitors.delete(id);
  }
  async customerActivity(startDate: string, endDate: string, now: number) {
    const cutoff = retentionDay(now, this.timezone);
    return { availableFrom: this.customerCoverage === undefined ? null : new Date(this.customerCoverage).toISOString(), retainedFrom: cutoff, items: [...this.customerHours.values()].filter(row => row.period.slice(0, 10) >= startDate && row.period.slice(0, 10) >= cutoff && row.period.slice(0, 10) <= endDate) };
  }
  async ping() {}
  async close() {}
}
