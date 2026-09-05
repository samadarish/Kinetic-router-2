import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import type { AnalyticsAcquisition, AnalyticsActions, AnalyticsOverview, AnalyticsPages, AnalyticsPerformance, AnalyticsQuery, AnalyticsTotals } from '@kineticrouter/portal-contract';
import { ACTIONS, DAY_MS, SESSION_MS, analyticsDay, metricRating, previousRange, retentionDay, type Acquisition, type AnalyticsSession, type AnalyticsStore, type ReportKind, type StoredEvent } from './model.js';
import { ANALYTICS_SCHEMA } from './schema.js';

const fields = `id uuid, "pageId" uuid, "sessionId" uuid, "visitorId" uuid, day date, surface text, path text, at bigint, name text, "engagementMs" bigint, metric text, "metricId" text, value double precision`;
const scope = `day BETWEEN $1::date AND $2::date AND ($3 = 'all' OR surface = $3) AND ($4 = '' OR position(lower($4) in lower(path)) > 0)`;
const args = (query: AnalyticsQuery) => [query.startDate, query.endDate, query.surface, query.search];
const numbers = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value ?? 0)]));

export class PostgresAnalyticsStore implements AnalyticsStore {
  readonly kind = 'postgres' as const;
  readonly pool: Pool;
  private initialized?: Promise<void>;
  private retryAt = 0;
  private partitionsReady = '';
  constructor(url: string, readonly timezone = 'Asia/Kolkata') {
    this.pool = new Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 1500, idleTimeoutMillis: 30_000, statement_timeout: 5000, query_timeout: 6500, application_name: 'kineticrouter-analytics' });
    this.pool.on('error', () => { /* Individual operations expose availability; never crash account APIs. */ });
  }
  async initialize() {
    if (this.initialized) return this.initialized;
    if (Date.now() < this.retryAt) throw new Error('Analytics database is reconnecting.');
    const operation = (async () => {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(741029118)');
        await client.query(ANALYTICS_SCHEMA);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
      finally { client.release(); }
      await this.ensurePartitions(Date.now());
    })();
    this.initialized = operation;
    try { await operation; } catch (error) { this.initialized = undefined; this.retryAt = Date.now() + 5000; throw error; }
  }
  private async ensurePartitions(now: number) {
    const today = analyticsDay(now, this.timezone);
    if (this.partitionsReady === today) return;
    const base = Date.parse(today);
    for (let offset = -2; offset <= 2; offset++) {
      const day = new Date(base + offset * DAY_MS).toISOString().slice(0, 10);
      const next = new Date(base + (offset + 1) * DAY_MS).toISOString().slice(0, 10);
      await this.pool.query(`CREATE TABLE IF NOT EXISTS kr_analytics_events_${day.replaceAll('-', '')} PARTITION OF kr_analytics_events FOR VALUES FROM ('${day}') TO ('${next}')`);
    }
    this.partitionsReady = today;
  }
  async session(visitorId: string, acquisition: Acquisition, now: number): Promise<AnalyticsSession> {
    await this.initialize();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO kr_analytics_visitors(id, first_seen) VALUES($1,$2) ON CONFLICT DO NOTHING', [visitorId, now]);
      const visitor = (await client.query('SELECT * FROM kr_analytics_visitors WHERE id=$1 FOR UPDATE', [visitorId])).rows[0]!;
      const old = visitor.current_session ? (await client.query('SELECT * FROM kr_analytics_sessions WHERE id=$1', [visitor.current_session])).rows[0] : undefined;
      let row = old;
      if (!row || now - Number(row.last_seen) >= SESSION_MS) {
        row = (await client.query(`INSERT INTO kr_analytics_sessions(id,visitor_id,started_at,last_seen,referrer,source,medium,campaign,device,browser,os) VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [randomUUID(), visitorId, now, acquisition.referrer, acquisition.source, acquisition.medium, acquisition.campaign, acquisition.device, acquisition.browser, acquisition.os])).rows[0]!;
        await client.query('UPDATE kr_analytics_visitors SET current_session=$2 WHERE id=$1', [visitorId, row.id]);
      }
      await client.query('COMMIT');
      return { id: row.id, visitorId, startedAt: Number(row.started_at), lastSeen: Number(row.last_seen), firstSeen: Number(visitor.first_seen), referrer: row.referrer, source: row.source, medium: row.medium, campaign: row.campaign, device: row.device, browser: row.browser, os: row.os };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  }
  async write(events: StoredEvent[]) {
    if (!events.length) return;
    await this.initialize();
    await this.ensurePartitions(Date.now());
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(`INSERT INTO kr_analytics_events(day,id,at,payload) SELECT (e->>'day')::date,(e->>'id')::uuid,(e->>'at')::bigint,e FROM jsonb_array_elements($1::jsonb) e WHERE e->>'name' <> 'engagement' ON CONFLICT DO NOTHING RETURNING id,to_char(day,'YYYY-MM-DD') AS day`, [JSON.stringify(events)]);
      const accepted = new Set(inserted.rows.map(row => `${row.id}:${row.day}`));
      const fresh = events.filter(event => event.name === 'engagement' || accepted.delete(`${event.id}:${event.day}`));
      const payload = JSON.stringify(fresh);
      await client.query(`INSERT INTO kr_analytics_facts(page_id,day,session_id,visitor_id,surface,path,at,views,engagement_ms)
        SELECT DISTINCT ON ("pageId",day) "pageId",day,"sessionId","visitorId",surface,path,at,views,ms FROM (
          SELECT "pageId",day,"sessionId","visitorId",surface,path,min(at) at,max(CASE WHEN name='page_view' THEN 1 ELSE 0 END) views,max(CASE WHEN name='engagement' THEN COALESCE("engagementMs",0) ELSE 0 END) ms
          FROM jsonb_to_recordset($1::jsonb) AS e(${fields}) GROUP BY "pageId",day,"sessionId","visitorId",surface,path
        ) canonical ORDER BY "pageId",day,at,"sessionId",path
        ON CONFLICT(page_id,day) DO UPDATE SET views=GREATEST(kr_analytics_facts.views,EXCLUDED.views), engagement_ms=GREATEST(kr_analytics_facts.engagement_ms,EXCLUDED.engagement_ms), at=LEAST(kr_analytics_facts.at,EXCLUDED.at)
        WHERE kr_analytics_facts.session_id=EXCLUDED.session_id AND kr_analytics_facts.path=EXCLUDED.path AND kr_analytics_facts.surface=EXCLUDED.surface`, [payload]);
      await client.query(`INSERT INTO kr_analytics_actions(id,day,session_id,visitor_id,surface,path,name,at) SELECT id,day,"sessionId","visitorId",surface,path,name,at FROM jsonb_to_recordset($1::jsonb) AS e(${fields}) WHERE name=ANY($2::text[]) ON CONFLICT DO NOTHING`, [payload, ACTIONS]);
      await client.query(`INSERT INTO kr_analytics_vitals(page_id,metric_id,metric,day,session_id,visitor_id,surface,path,at,value)
        SELECT DISTINCT ON ("pageId",metric,"metricId") "pageId","metricId",metric,day,"sessionId","visitorId",surface,path,at,value FROM jsonb_to_recordset($1::jsonb) AS e(${fields}) WHERE name='web_vital' ORDER BY "pageId",metric,"metricId",at DESC
        ON CONFLICT(page_id,metric,metric_id) DO UPDATE SET value=EXCLUDED.value,at=EXCLUDED.at WHERE EXCLUDED.at >= kr_analytics_vitals.at AND EXCLUDED.session_id=kr_analytics_vitals.session_id`, [payload]);
      await client.query(`UPDATE kr_analytics_sessions s SET last_seen=GREATEST(s.last_seen,e.at),started_at=LEAST(s.started_at,e.first_at) FROM (SELECT "sessionId",max(at) at,min(at) first_at FROM jsonb_to_recordset($1::jsonb) AS e(${fields}) GROUP BY "sessionId") e WHERE s.id=e."sessionId"`, [payload]);
      await client.query(`UPDATE kr_analytics_visitors v SET first_seen=LEAST(v.first_seen,e.at) FROM (SELECT "visitorId",min(at) at FROM jsonb_to_recordset($1::jsonb) AS e(${fields}) GROUP BY "visitorId") e WHERE v.id=e."visitorId" AND v.first_seen>e.at`, [payload]);
      for (const direction of ['entry', 'exit'] as const) {
        const order = direction === 'entry' ? 'ASC' : 'DESC'; const comparison = direction === 'entry' ? '<' : '>';
        await client.query(`UPDATE kr_analytics_sessions s SET ${direction}_path=e.path,${direction}_surface=e.surface,${direction}_at=e.at,${direction}_id=e."pageId"
          FROM (SELECT DISTINCT ON ("sessionId") * FROM jsonb_to_recordset($1::jsonb) AS e(${fields}) WHERE name='page_view' ORDER BY "sessionId",at ${order},"pageId" ${order}) e
          WHERE s.id=e."sessionId" AND (s.${direction}_at IS NULL OR (e.at,e."pageId") ${comparison} (s.${direction}_at,s.${direction}_id))`, [payload]);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  }
  private async totals(query: AnalyticsQuery): Promise<AnalyticsTotals> {
    const result = await this.pool.query(`WITH f AS (SELECT * FROM kr_analytics_facts WHERE ${scope}),
      per_session AS (SELECT session_id,sum(views) views,sum(engagement_ms) ms FROM f GROUP BY session_id),
      successful AS (SELECT DISTINCT session_id FROM kr_analytics_actions WHERE ${scope} AND name IN ('sign_in','api_key_created','redemption'))
      SELECT (SELECT count(DISTINCT visitor_id) FROM f) visitors,
      (SELECT count(DISTINCT f.visitor_id) FROM f JOIN kr_analytics_visitors v ON v.id=f.visitor_id WHERE (to_timestamp(v.first_seen/1000.0) AT TIME ZONE $5)::date >= $1::date) new_visitors,
      count(*) sessions,COALESCE(sum(views),0) pageviews,COALESCE(avg(ms),0) average_ms,
      COALESCE(100.0*count(*) FILTER(WHERE ms>=10000 OR views>=2 OR session_id IN (SELECT session_id FROM successful))/NULLIF(count(*),0),0) engagement_rate FROM per_session`, [...args(query), this.timezone]);
    const row = numbers(result.rows[0]!);
    return { visitors: row.visitors!, sessions: row.sessions!, pageviews: row.pageviews!, newVisitors: row.new_visitors!, returningVisitors: row.visitors! - row.new_visitors!, averageEngagementMs: row.average_ms!, engagementRate: row.engagement_rate!, bounceRate: row.sessions ? 100 - row.engagement_rate! : 0 };
  }
  async report(kind: ReportKind, query: AnalyticsQuery, now: number): Promise<unknown> {
    await this.initialize();
    if (kind === 'overview') {
      const previous = previousRange(query);
      const [totals, previousTotals, trend] = await Promise.all([
        this.totals(query), this.totals(previous),
        this.pool.query(`WITH daily AS (SELECT day,count(DISTINCT visitor_id) visitors,count(DISTINCT session_id) sessions,sum(views) pageviews FROM kr_analytics_facts WHERE ${scope} GROUP BY day)
          SELECT to_char(d,'YYYY-MM-DD') date,COALESCE(visitors,0) visitors,COALESCE(sessions,0) sessions,COALESCE(pageviews,0) pageviews FROM generate_series($1::date,$2::date,'1 day') d LEFT JOIN daily ON daily.day=d::date ORDER BY d`, args(query)),
      ]);
      return { generatedAt: new Date(now).toISOString(), timezone: this.timezone, storage: this.kind, range: { startDate: query.startDate, endDate: query.endDate, previousStartDate: previous.startDate, previousEndDate: previous.endDate, comparisonAvailable: previous.startDate >= retentionDay(now, this.timezone) }, totals, previous: previousTotals, trend: trend.rows.map(row => ({ date: row.date, visitors: Number(row.visitors), sessions: Number(row.sessions), pageviews: Number(row.pageviews) })) } satisfies AnalyticsOverview;
    }
    if (kind === 'pages') {
      const result = await this.pool.query(`WITH f AS (SELECT * FROM kr_analytics_facts WHERE ${scope}), pages AS (
        SELECT surface,path,count(DISTINCT visitor_id) visitors,sum(views) pageviews,sum(engagement_ms) engagement_ms FROM f GROUP BY surface,path),
        entries AS (SELECT entry_surface surface,entry_path path,count(*) total FROM kr_analytics_sessions WHERE id IN(SELECT session_id FROM f) AND (to_timestamp(entry_at/1000.0) AT TIME ZONE $5)::date BETWEEN $1::date AND $2::date GROUP BY entry_surface,entry_path),
        exits AS (SELECT exit_surface surface,exit_path path,count(*) total FROM kr_analytics_sessions WHERE id IN(SELECT session_id FROM f) AND (to_timestamp(exit_at/1000.0) AT TIME ZONE $5)::date BETWEEN $1::date AND $2::date GROUP BY exit_surface,exit_path)
        SELECT p.*,COALESCE(e.total,0) entrances,COALESCE(x.total,0) exits,count(*) OVER() total FROM pages p LEFT JOIN entries e USING(surface,path) LEFT JOIN exits x USING(surface,path) ORDER BY pageviews DESC,path,surface LIMIT $6 OFFSET $7`, [...args(query), this.timezone, query.pageSize, (query.page - 1) * query.pageSize]);
      const total = result.rows[0]?.total ?? (await this.pool.query(`SELECT count(*) total FROM (SELECT surface,path FROM kr_analytics_facts WHERE ${scope} GROUP BY surface,path) p`, args(query))).rows[0]?.total ?? 0;
      return { items: result.rows.map(row => ({ surface: row.surface, path: row.path, visitors: Number(row.visitors), pageviews: Number(row.pageviews), engagementMs: Number(row.engagement_ms), entrances: Number(row.entrances), exits: Number(row.exits) })), total: Number(total), page: query.page, pageSize: query.pageSize } satisfies AnalyticsPages;
    }
    if (kind === 'acquisition') {
      const result = await this.pool.query(`WITH sessions AS (SELECT DISTINCT s.* FROM kr_analytics_sessions s JOIN kr_analytics_facts f ON f.session_id=s.id WHERE ${scope.split('surface').join('f.surface').split('path').join('f.path')}),
        dimensions AS (SELECT id,visitor_id,d.* FROM sessions CROSS JOIN LATERAL (VALUES ('referrers',COALESCE(NULLIF(referrer,''),'Direct')),('sources',COALESCE(NULLIF(source,''),'direct') || ' / ' || COALESCE(NULLIF(medium,''),'none')),('campaigns',COALESCE(NULLIF(campaign,''),'Unspecified')),('devices',device),('browsers',browser),('operatingSystems',os)) AS d(kind,label)),
        grouped AS (SELECT kind,label,count(*) sessions,count(DISTINCT visitor_id) visitors FROM dimensions GROUP BY kind,label)
        SELECT * FROM (SELECT *,row_number() OVER(PARTITION BY kind ORDER BY sessions DESC,label) rank FROM grouped) ranked WHERE rank<=100`, args(query));
      const output: AnalyticsAcquisition = { referrers: [], sources: [], campaigns: [], devices: [], browsers: [], operatingSystems: [] };
      for (const row of result.rows) output[row.kind as keyof AnalyticsAcquisition].push({ label: row.label, sessions: Number(row.sessions), visitors: Number(row.visitors) });
      return output;
    }
    if (kind === 'actions') {
      const [counts, funnel] = await Promise.all([
        this.pool.query(`SELECT name,count(*) count,count(DISTINCT session_id) sessions FROM kr_analytics_actions WHERE ${scope} GROUP BY name`, args(query)),
        this.pool.query(`WITH e AS (SELECT * FROM kr_analytics_actions WHERE ${scope}), clicked AS (SELECT session_id,min(at) at FROM e WHERE name='cta_click' GROUP BY session_id), signed AS (SELECT c.session_id,min(e.at) at FROM clicked c JOIN e ON e.session_id=c.session_id AND e.name='sign_in' AND e.at>=c.at GROUP BY c.session_id), created AS (SELECT DISTINCT s.session_id FROM signed s JOIN e ON e.session_id=s.session_id AND e.name='api_key_created' AND e.at>=s.at)
          SELECT (SELECT count(*) FROM clicked) clicked,(SELECT count(*) FROM signed) signed,(SELECT count(*) FROM created) created`, args(query)),
      ]);
      return { actions: ACTIONS.map(name => { const row = counts.rows.find(row => row.name === name); return { name, count: Number(row?.count ?? 0), sessions: Number(row?.sessions ?? 0) }; }), funnelAvailable: query.surface === 'all', funnel: [{ name: 'Console CTA', sessions: Number(funnel.rows[0]?.clicked ?? 0) }, { name: 'Signed in', sessions: Number(funnel.rows[0]?.signed ?? 0) }, { name: 'API key created', sessions: Number(funnel.rows[0]?.created ?? 0) }] } satisfies AnalyticsActions;
    }
    const result = await this.pool.query(`SELECT surface,path,metric,percentile_disc(0.75) WITHIN GROUP(ORDER BY value) p75,count(*) samples FROM kr_analytics_vitals WHERE ${scope} GROUP BY surface,path,metric ORDER BY samples DESC,path LIMIT 100`, args(query));
    return { estimated: false, items: result.rows.map(row => ({ surface: row.surface, path: row.path, metric: row.metric, p75: Number(row.p75), samples: Number(row.samples), rating: metricRating(row.metric, Number(row.p75)) })) } satisfies AnalyticsPerformance;
  }
  async maintain(now: number) {
    await this.initialize(); await this.ensurePartitions(now);
    const rawCutoff = analyticsDay(now - 90 * DAY_MS, this.timezone).replaceAll('-', '');
    const partitions = await this.pool.query("SELECT tablename FROM pg_tables WHERE schemaname=current_schema() AND tablename LIKE 'kr_analytics_events_%'");
    for (const { tablename } of partitions.rows) if (/^kr_analytics_events_\d{8}$/.test(tablename) && tablename.slice(-8) < rawCutoff) await this.pool.query(`DROP TABLE ${tablename}`);
    const cutoff = retentionDay(now, this.timezone);
    const client = await this.pool.connect();
    try {
      await this.prune(client, 'kr_analytics_facts', cutoff); await this.prune(client, 'kr_analytics_actions', cutoff); await this.prune(client, 'kr_analytics_vitals', cutoff);
      await client.query(`DELETE FROM kr_analytics_sessions s WHERE s.id IN (SELECT id FROM kr_analytics_sessions WHERE last_seen < $1 LIMIT 10000) AND NOT EXISTS(SELECT 1 FROM kr_analytics_facts f WHERE f.session_id=s.id) AND NOT EXISTS(SELECT 1 FROM kr_analytics_actions a WHERE a.session_id=s.id) AND NOT EXISTS(SELECT 1 FROM kr_analytics_vitals v WHERE v.session_id=s.id)`, [Date.parse(cutoff)]);
      await client.query('DELETE FROM kr_analytics_visitors v WHERE first_seen<$1 AND NOT EXISTS(SELECT 1 FROM kr_analytics_sessions s WHERE s.visitor_id=v.id)', [Date.parse(cutoff)]);
    } finally { client.release(); }
  }
  private async prune(client: PoolClient, table: string, cutoff: string) { await client.query(`DELETE FROM ${table} WHERE ctid IN (SELECT ctid FROM ${table} WHERE day<$1::date LIMIT 10000)`, [cutoff]); }
  async ping() { await this.initialize(); await this.pool.query('SELECT 1'); }
  async close() { await this.pool.end(); }
}
