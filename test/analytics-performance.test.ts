import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostgresAnalyticsStore } from '../apps/bff/src/analytics/postgres-store';
import { MemoryAnalyticsStore } from '../apps/bff/src/analytics/memory-store';
import { analyticsDay, type StoredEvent } from '../apps/bff/src/analytics/model';
import type { AnalyticsActions, AnalyticsOverview, AnalyticsPages } from '@kineticrouter/portal-contract';

const stores: PostgresAnalyticsStore[] = [];
afterEach(async () => { await Promise.all(stores.splice(0).map(store => store.close())); vi.restoreAllMocks(); });

async function postgresHarness() {
  const store = new PostgresAnalyticsStore('postgres://unused:unused@localhost/unused');
  stores.push(store);
  const accepted = new Set<string>();
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (!sql.startsWith('INSERT INTO kr_analytics_events(')) return { rows: [] };
    const events = JSON.parse(String(values![0])) as StoredEvent[];
    return { rows: events.filter(event => {
      const key = `${event.id}:${event.day}`;
      if (event.name === 'engagement' || accepted.has(key)) return false;
      accepted.add(key); return true;
    }).map(event => ({ id: event.id, day: event.day })) };
  });
  const release = vi.fn();
  vi.spyOn(store.pool, 'connect').mockResolvedValue({ query, release } as never);
  vi.spyOn(store.pool, 'query').mockResolvedValue({ rows: [] } as never);
  await store.initialize(); query.mockClear(); release.mockClear();
  return { store, query, release, statements: () => query.mock.calls.map(([sql]) => sql) };
}

function event(name: StoredEvent['name']): StoredEvent {
  const at = Date.now();
  return { id: randomUUID(), pageId: randomUUID(), sessionId: randomUUID(), visitorId: randomUUID(), at, day: analyticsDay(at, 'Asia/Kolkata'), surface: 'site', path: '/docs', name,
    ...(name === 'engagement' ? { engagementMs: 20_000 } : {}),
    ...(name === 'web_vital' ? { metric: 'LCP', metricId: 'metric', value: 1500 } as const : {}),
  };
}

describe('analytics collection database work', () => {
  it('commits presence-only activity with four statements and no event-table writes', async () => {
    const { store, query, release, statements } = await postgresHarness();
    const at = Date.parse('2026-09-14T00:00:00Z');
    await store.write([], [{ userId: 'customer', at: at + 1000 }, { userId: 'customer', at }]);
    expect(statements()).toHaveLength(4);
    expect(statements()[0]).toBe('BEGIN'); expect(statements().at(-1)).toBe('COMMIT');
    expect(query.mock.calls[1]![1]).toEqual([at]);
    expect(JSON.parse(String(query.mock.calls[2]![1]![0]))).toEqual([
      { user_id: 'customer', day: '2026-09-14', hour: 5, at: at + 1000 },
      { user_id: 'customer', day: '2026-09-14', hour: 5, at },
    ]);
    expect(statements().some(sql => /kr_analytics_(events|facts|actions|vitals|sessions|visitors)\b/.test(sql))).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });

  it.each([
    ['engagement', 5, false, false, false],
    ['page_view', 8, false, false, true],
    ['cta_click', 7, true, false, false],
    ['web_vital', 7, false, true, false],
  ] as const)('writes only applicable aggregates for %s', async (name, count, actions, vitals, paths) => {
    const { store, query, statements } = await postgresHarness();
    const input = event(name);
    await store.write([input]);
    expect(statements()).toHaveLength(count);
    expect(statements().some(sql => sql.startsWith('INSERT INTO kr_analytics_actions('))).toBe(actions);
    expect(statements().some(sql => sql.startsWith('INSERT INTO kr_analytics_vitals('))).toBe(vitals);
    expect(statements().some(sql => sql.startsWith('UPDATE kr_analytics_sessions s SET entry_path'))).toBe(paths);
    expect(statements().some(sql => sql.startsWith('UPDATE kr_analytics_sessions s SET exit_path'))).toBe(paths);
    const facts = query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO kr_analytics_facts('));
    expect(JSON.parse(String(facts![1]![0]))).toEqual([input]);
    expect(statements()[0]).toBe('BEGIN'); expect(statements().at(-1)).toBe('COMMIT');
  });

  it('retains all aggregate writes for mixed batches and skips replayed raw events', async () => {
    const { store, query, statements } = await postgresHarness();
    const events = ['page_view', 'engagement', 'sign_in', 'web_vital'].map(name => event(name as StoredEvent['name']));
    await store.write(events, [{ userId: 'customer', at: Date.now() }]);
    expect(statements()).toHaveLength(12);
    const facts = query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO kr_analytics_facts('));
    expect(JSON.parse(String(facts![1]![0]))).toEqual(events);
    query.mockClear();
    await store.write([events[0]!, { ...events[0]!, path: '/pricing' }]);
    expect(statements()).toHaveLength(3);
    expect(statements()[0]).toBe('BEGIN'); expect(statements().at(-1)).toBe('COMMIT');
    expect(statements().some(sql => sql.includes('kr_analytics_facts'))).toBe(false);
  });

  it.each(['kr_analytics_customer_hours', 'kr_analytics_facts'])('rolls back and releases the client when %s fails', async table => {
    const { store, query, release, statements } = await postgresHarness();
    const execute = query.getMockImplementation()!;
    query.mockImplementation(async (sql, values) => {
      if (sql.startsWith(`INSERT INTO ${table}(`)) throw new Error('database unavailable');
      return execute(sql, values);
    });
    const events = table === 'kr_analytics_customer_hours' ? [] : [event('engagement')];
    await expect(store.write(events, [{ userId: 'customer', at: Date.now() }])).rejects.toThrow('database unavailable');
    expect(statements()).toContain('ROLLBACK'); expect(statements()).not.toContain('COMMIT');
    expect(release).toHaveBeenCalledOnce();
  });
});

describe('analytics grouped memory reports', () => {
  it('keeps zero-filled trends, ordered funnels and per-page boundaries across a crowded shared path', async () => {
    const store = new MemoryAnalyticsStore('UTC');
    const at = Date.parse('2026-09-10T12:00:00Z');
    const acquisition = { referrer: '', source: '', medium: '', campaign: '', device: 'Desktop', browser: 'Chrome', os: 'Windows' };
    for (let index = 0; index < 300; index++) {
      const visitorId = `visitor-${index}`;
      const session = await store.session(visitorId, acquisition, at);
      const base = { ...event('page_view'), visitorId, sessionId: session.id, at, day: '2026-09-10' };
      const final = { ...base, id: randomUUID(), pageId: randomUUID(), path: '/pricing', at: at + 2000 };
      await store.write([
        base, final,
        ...(['api_key_created', 'sign_in', 'cta_click'] as const).map(name => ({ ...base, name, id: randomUUID(), at: at + 1000 })),
        { ...base, name: 'engagement', id: randomUUID(), engagementMs: 2000 },
      ]);
    }
    const query = { startDate: '2026-09-10', endDate: '2026-09-12', surface: 'all' as const, search: '', page: 1, pageSize: 25 };
    const report = await store.report('overview', query, at) as AnalyticsOverview;
    expect(report.totals).toEqual({ visitors: 300, sessions: 300, pageviews: 600, newVisitors: 300, returningVisitors: 0, engagementRate: 100, bounceRate: 0, averageEngagementMs: 2000 });
    expect(report.trend).toEqual([
      { date: '2026-09-10', visitors: 300, sessions: 300, pageviews: 600 },
      { date: '2026-09-11', visitors: 0, sessions: 0, pageviews: 0 },
      { date: '2026-09-12', visitors: 0, sessions: 0, pageviews: 0 },
    ]);
    const pages = await store.report('pages', query, at) as AnalyticsPages;
    expect(pages.items).toEqual([
      { surface: 'site', path: '/docs', visitors: 300, pageviews: 300, engagementMs: 600000, entrances: 300, exits: 0 },
      { surface: 'site', path: '/pricing', visitors: 300, pageviews: 300, engagementMs: 0, entrances: 0, exits: 300 },
    ]);
    const actions = await store.report('actions', query, at) as AnalyticsActions;
    expect(actions.funnel.map(step => step.sessions)).toEqual([300, 300, 300]);
    expect((await store.report('pages', { ...query, page: 2 }, at) as AnalyticsPages)).toMatchObject({ items: [], total: 2 });
    expect((await store.report('overview', { ...query, search: 'PRICING' }, at) as AnalyticsOverview).totals).toMatchObject({ pageviews: 300, engagementRate: 0, bounceRate: 100, averageEngagementMs: 0 });
  });
});
