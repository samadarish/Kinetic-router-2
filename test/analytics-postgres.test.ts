import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresAnalyticsStore } from '../apps/bff/src/analytics/postgres-store';
import { MemoryAnalyticsStore } from '../apps/bff/src/analytics/memory-store';
import { DAY_MS, analyticsDay, type StoredEvent } from '../apps/bff/src/analytics/model';
import type { AnalyticsOverview, AnalyticsPages } from '@kineticrouter/portal-contract';

const connection = process.env.TEST_ANALYTICS_DATABASE_URL;
describe.skipIf(!connection)('PostgreSQL analytics integration', () => {
  const schema = `kr_analytics_test_${randomUUID().replaceAll('-', '')}`;
  const now = Date.now(); const day = analyticsDay(now, 'Asia/Kolkata');
  const acquisition = { referrer: 'github.com', source: 'github.com', medium: 'referral', campaign: 'launch', device: 'Desktop', browser: 'Chrome', os: 'Windows' };
  const query = { startDate: day, endDate: day, surface: 'all' as const, page: 1, pageSize: 25, search: '' };
  let root: Pool; let store: PostgresAnalyticsStore; let memory: MemoryAnalyticsStore;
  let event: StoredEvent;
  beforeAll(async () => {
    root = new Pool({ connectionString: connection!, connectionTimeoutMillis: 3000 });
    await root.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(connection!); url.searchParams.set('options', `-c search_path=${schema}`);
    store = new PostgresAnalyticsStore(url.toString()); memory = new MemoryAnalyticsStore();
    const visitor = randomUUID();
    const session = await store.session(visitor, acquisition, now); const local = await memory.session(visitor, acquisition, now);
    memory.sessions.delete(local.id); local.id = session.id; memory.sessions.set(local.id, local);
    event = { id: randomUUID(), pageId: randomUUID(), sessionId: session.id, visitorId: visitor, at: now, day, surface: 'site', path: '/docs', name: 'page_view' };
  }, 30_000);
  afterAll(async () => {
    await store?.close();
    if (root) { if (!/^kr_analytics_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe test schema'); await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await root.end(); }
  });
  it('commits idempotently, preserves high-water engagement, and executes every reporting query', async () => {
    const events: StoredEvent[] = [event, { ...event, id: randomUUID(), name: 'engagement', engagementMs: 20_000 }, { ...event, id: randomUUID(), name: 'cta_click', at: now + 1 }, { ...event, id: randomUUID(), name: 'sign_in', at: now + 2 }, { ...event, id: randomUUID(), name: 'api_key_created', at: now + 3 }, { ...event, id: randomUUID(), name: 'web_vital', metric: 'LCP', value: 1700, metricId: 'test-lcp' }];
    await store.write(events); await memory.write(events);
    await Promise.all([store.write([event]), store.write([{ ...event, id: randomUUID(), name: 'engagement', engagementMs: 15_000 }]), store.write([{ ...event, id: randomUUID(), name: 'engagement', engagementMs: 20_000 }])]);
    for (const kind of ['overview', 'pages', 'acquisition', 'actions', 'performance'] as const) {
      const actual = await store.report(kind, query, now); const expected = await memory.report(kind, query, now);
      if (kind === 'overview') expect({ ...actual as object, storage: 'memory' }).toEqual(expected);
      else expect(actual).toEqual(expected);
    }
    expect((await store.pool.query('SELECT count(*) count FROM kr_analytics_facts')).rows[0].count).toBe('1');
  });
  it('does not mutate reports when a committed event ID is replayed with changed fields', async () => {
    const before = await store.report('overview', query, now) as AnalyticsOverview;
    await store.write([{ ...event, pageId: randomUUID(), path: '/pricing' }]);
    expect((await store.report('overview', query, now) as AnalyticsOverview).totals).toEqual(before.totals);
  });
  it('cannot poison a shared flush with conflicting metadata for a single page ID', async () => {
    const first = { ...event, id: randomUUID(), pageId: randomUUID(), path: '/pricing' };
    const other = { ...event, id: randomUUID(), pageId: randomUUID(), path: '/models' };
    await expect(store.write([first, { ...first, id: randomUUID(), path: '/docs' }, other])).resolves.toBeUndefined();
    expect((await store.report('pages', query, now) as AnalyticsPages).items.some(row => row.path === '/models')).toBe(true);
  });
  it('retains pagination totals beyond the final page and ignores non-engagement durations', async () => {
    const pages = await store.report('pages', query, now) as AnalyticsPages;
    const missing = await store.report('pages', { ...query, page: 100 }, now) as AnalyticsPages;
    expect(missing.total).toBe(pages.total); expect(missing.items).toEqual([]);
    await store.write([{ ...event, id: randomUUID(), name: 'cta_click', engagementMs: 80_000 }]);
    const fact = (await store.pool.query('SELECT engagement_ms FROM kr_analytics_facts WHERE page_id=$1', [event.pageId])).rows[0];
    expect(Number(fact.engagement_ms)).toBe(20_000);
  });
  it('keeps 100-day-old reporting facts after raw-event retention maintenance', async () => {
    const oldAt = now - 100 * DAY_MS; const oldDay = analyticsDay(oldAt, 'Asia/Kolkata');
    await store.pool.query(`INSERT INTO kr_analytics_facts(page_id,day,session_id,visitor_id,surface,path,at,views) VALUES($1,$2,$3,$4,'site','/docs',$5,1)`, [randomUUID(), oldDay, event.sessionId, event.visitorId, oldAt]);
    await store.maintain(now);
    const report = await store.report('overview', { ...query, startDate: oldDay, endDate: oldDay }, now) as AnalyticsOverview;
    expect(report.totals.pageviews).toBe(1); expect(report.totals.visitors).toBe(1);
  });
});
