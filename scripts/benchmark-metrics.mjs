// npm run build:bff
// node --expose-gc scripts/benchmark-metrics.mjs [saved-ESM-metrics-build-directory]
// An optional baseline directory must contain activity.js and its sibling modules.
import { strict as assert } from 'node:assert';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as current from '../apps/bff/dist/metrics/activity.js';
import { addDays, chunks } from '../apps/bff/dist/metrics/time.js';

const baseline = process.argv[2] ? await import(pathToFileURL(resolve(process.argv[2], 'activity.js')).href) : null;
const startDate = '2025-09-15', endDate = '2026-09-14';
const now = Date.parse('2026-09-14T14:32:00+05:30');
const coverage = { availableFrom: '2025-09-15T00:35:00+05:30', through: new Date(now).toISOString(), complete: false, basis: 'retained-api-history', storage: 'upstream', notice: 'Retained usage' };
const input = { startDate, endDate, timezone: 'Asia/Kolkata', now, coverage, source: 'api' };

function fold(implementation, config, batches) {
  const stream = implementation.pagedActivity({ ...config, page: 1 });
  for (const batch of batches) stream.add(batch.startDate, batch.endDate, batch.rows);
  return stream.finish();
}

let equivalentReports = 0;
if (baseline) {
  for (const timezone of ['UTC', 'Asia/Kolkata', 'Pacific/Chatham', 'America/New_York']) {
    for (const source of ['api', 'console']) for (const availableFrom of [null, '2026-03-01T00:00:00Z', '2026-03-07T07:23:00Z']) {
      const config = { ...input, source, timezone, startDate: '2026-03-01', endDate: '2026-03-15', now: Date.parse('2026-03-15T14:35:00Z'), coverage: { ...coverage, availableFrom } };
      const batches = chunks(config.startDate, config.endDate, 3).reverse().map(range => ({ ...range, rows: Array.from({ length: 20 }, (_, index) => ({ period: `${range.startDate} ${String(index).padStart(2, '0')}:00`, userId: String(index % 3), requests: index % 5, actualCost: index % 2 ? '0' : '0.000000000001' })) }));
      const rows = batches.flatMap(batch => batch.rows);
      assert.deepEqual(current.activityReport({ ...config, rows }), baseline.activityReport({ ...config, rows }));
      assert.deepEqual(fold(current, config, batches), fold(baseline, config, batches));
      equivalentReports += 2;
    }
  }
}

function measure(operations) {
  const samples = operations.map(() => []);
  for (const operation of operations) operation();
  for (let sample = 0; sample < 7; sample++) {
    // Alternate implementations to reduce ordering effects from warmup and GC.
    const indexes = operations.map((_, index) => index);
    if (sample % 2) indexes.reverse();
    for (const index of indexes) {
      global.gc?.();
      const start = performance.now(); operations[index]();
      samples[index].push(performance.now() - start);
    }
  }
  return samples.map(values => Number(values.sort((a, b) => a - b)[3].toFixed(2)));
}

const results = [];
function benchmark(name, rowCount, operation) {
  if (baseline) { assert.deepEqual(operation(current), operation(baseline)); equivalentReports++; }
  const times = measure(baseline ? [() => operation(baseline), () => operation(current)] : [() => operation(current)]);
  const result = baseline
    ? { name, rowCount, baselineMedianMs: times[0], currentMedianMs: times[1], speedup: Number((times[0] / times[1]).toFixed(2)) }
    : { name, rowCount, currentMedianMs: times[0] };
  results.push(result); process.stdout.write(`${JSON.stringify(result)}\n`);
}

for (const dense of [false, true]) {
  const batches = chunks(startDate, endDate, 7).reverse().map(range => {
    const rows = [];
    for (let day = range.startDate; day <= range.endDate; day = addDays(day, 1)) {
      for (let hour = 0; hour < 24; hour++) for (let user = 0; user < (dense ? 10 : 1); user++) {
        if (!dense && hour % 5) continue;
        rows.push({ period: `${day} ${String(hour).padStart(2, '0')}:00`, userId: String(user), requests: (hour + user) % 7, actualCost: hour % 3 ? '0.000000000001' : '0.123456789123' });
      }
    }
    return { ...range, rows };
  });
  const rows = batches.flatMap(batch => batch.rows), density = dense ? 'dense' : 'sparse';
  for (const source of ['api', 'console']) benchmark(`365-day all-time ${source}, ${density}`, rows.length, implementation => fold(implementation, { ...input, source }, batches));
  benchmark(`365-day custom API, ${density}`, rows.length, implementation => implementation.activityReport({ ...input, rows }));
}
process.stdout.write(`${JSON.stringify({ equivalentReports, samplesPerScenario: 7, explicitGc: Boolean(global.gc), measurement: 'Median local aggregation time; excludes upstream/database/network latency.', results }, null, 2)}\n`);
