import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { PostgresAnalyticsStore } from '../apps/bff/dist/analytics/postgres-store.js';
import { AnalyticsService } from '../apps/bff/dist/analytics/service.js';
import { analyticsDay } from '../apps/bff/dist/analytics/model.js';
import { config } from '../apps/bff/dist/config.js';

const connection = process.env.TEST_ANALYTICS_DATABASE_URL;
if (!connection) throw new Error('Set TEST_ANALYTICS_DATABASE_URL to a disposable PostgreSQL database.');
const schema = `kr_analytics_benchmark_${randomUUID().replaceAll('-', '')}`;
const root = new Pool({ connectionString: connection, statement_timeout: 120_000 });
await root.query(`CREATE SCHEMA ${schema}`);
const url = new URL(connection); url.searchParams.set('options', `-c search_path=${schema}`);
const store = new PostgresAnalyticsStore(url.toString());
const seed = new Pool({ connectionString: url.toString(), statement_timeout: 120_000 });
const service = new AnalyticsService({ store, enabled: true, identify: async () => undefined });
const today = analyticsDay(Date.now(), config.serverTimezone);
const startDate = new Date(Date.parse(today) - 394 * 86_400_000).toISOString().slice(0, 10);
const durations = { collection: [], live: [], cachedReport: [], uncachedReport: [] };
const percentile = values => Math.round([...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1] * 100) / 100;
try {
  await store.initialize();
  await seed.query(`INSERT INTO kr_analytics_visitors(id,first_seen) SELECT gen_random_uuid(),$1 FROM generate_series(1,500)`, [Date.parse(startDate)]);
  await seed.query(`INSERT INTO kr_analytics_sessions(id,visitor_id,started_at,last_seen,referrer,source,medium,campaign,device,browser,os)
    SELECT gen_random_uuid(),v.id,(extract(epoch from d)*1000)::bigint,(extract(epoch from d)*1000)::bigint+20000,'github.com','github.com','referral','','Desktop','Chrome','Windows'
    FROM kr_analytics_visitors v CROSS JOIN generate_series($1::date,$2::date,'1 day') d`, [startDate,today]);
  await seed.query(`INSERT INTO kr_analytics_facts(page_id,day,session_id,visitor_id,surface,path,at,views,engagement_ms)
    SELECT gen_random_uuid(),(to_timestamp(started_at/1000.0) AT TIME ZONE $1)::date,id,visitor_id,'site','/docs',started_at,1,20000 FROM kr_analytics_sessions`, [config.serverTimezone]);
  const seeded = Number((await seed.query('SELECT count(*) count FROM kr_analytics_facts')).rows[0].count);
  process.stdout.write(`Historical fixture: ${seeded} page/day facts across 395 days.\n`);
  const visitors = [];
  for (let offset=0; offset<500; offset+=25) {
    visitors.push(...await Promise.all(Array.from({length:25},async()=>{
      const tabId = randomUUID(); const response = await service.publicApp.request('/bootstrap', {method:'POST',headers:{origin:config.publicSiteOrigins[0],'content-type':'text/plain'},body:JSON.stringify({tabId})});
      if(response.status!==200) throw new Error(`Bootstrap failed ${response.status}`);
      const {data}=await response.json(); return {tabId,token:data.token,cookie:response.headers.get('set-cookie').split(';')[0],sequence:0};
    })));
  }
  const query = {startDate,endDate:today,surface:'all',page:'1',pageSize:'25',search:''};
  const start = performance.now(); await service.report('overview',query); durations.uncachedReport.push(performance.now()-start);
  const jobs = visitors.map((visitor,index)=>(async()=>{
    await delay(index*40); // 25 requests/s: above 500 visitors' steady 30-second heartbeat rate.
    const at=Date.now(); const body={token:visitor.token,tabId:visitor.tabId,path:'/docs',visible:true,sentAt:at,sequence:++visitor.sequence,events:[{id:randomUUID(),pageId:randomUUID(),at,path:'/docs',name:'page_view'}]};
    const started=performance.now();const response=await service.publicApp.request('/collect',{method:'POST',headers:{origin:config.publicSiteOrigins[0],cookie:visitor.cookie,'content-type':'text/plain'},body:JSON.stringify(body)});
    if(response.status!==204)throw new Error(`Collection failed ${response.status}`); durations.collection.push(performance.now()-started);
    const liveStart=performance.now();service.live('all',1,25);durations.live.push(performance.now()-liveStart);
    const reportStart=performance.now();await service.report('overview',query);durations.cachedReport.push(performance.now()-reportStart);
  })());
  await Promise.all(jobs);
  const bytes=Number((await seed.query(`SELECT sum(pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(tablename))) bytes FROM pg_tables WHERE schemaname=$1`,[schema])).rows[0].bytes);
  const result={simultaneousVisitors:service.live('all',1,25).visitors,historicalFacts:seeded,historicalDays:395,requestsPerSecond:25,collectionP95Ms:percentile(durations.collection),liveP95Ms:percentile(durations.live),cachedReportP95Ms:percentile(durations.cachedReport),uncachedOverviewMs:percentile(durations.uncachedReport),databaseBytes:bytes,bytesPerSeededFact:Math.round(bytes/seeded),health:service.health,measurement:'Local Hono request handling and PostgreSQL, excluding network/proxy latency. Not a VPS capacity guarantee.'};
  await mkdir('output/analytics',{recursive:true});await writeFile('output/analytics/benchmark.json',JSON.stringify(result,null,2)+'\n');process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(result.collectionP95Ms>=300||result.liveP95Ms>=300||result.cachedReportP95Ms>=500||result.uncachedOverviewMs>=2000)process.exitCode=1;
} finally {
  await service.close();await seed.end();
  if(!/^kr_analytics_benchmark_[a-f0-9]{32}$/.test(schema))throw new Error('Unsafe benchmark schema');
  await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();
}
