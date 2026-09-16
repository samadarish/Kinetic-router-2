# Performance review — September 16, 2026

Reviewed the public site, console, metrics service, analytics stores, shared clients, session/chat paths, and build/deployment setup. Implemented focused improvements to repeated aggregation, database work, array allocation, and rendering. Existing metrics definitions, UI controls, refresh intervals, authorization, cache limits, response contracts, database schema, and dependency versions are preserved. The existing work in progress was retained.

## Measurements

These are local synthetic measurements on Node 24, excluding production network latency. Timings are medians of seven samples; they are not production throughput estimates. The service and aggregation measurements isolate different changes and should not be multiplied together.

| Workload | Before | After |
| --- | ---: | ---: |
| 365-day all-time API aggregation, sparse | 258.17 ms | 70.41 ms |
| 365-day all-time API aggregation, 87,600 source rows | 275.30 ms | 135.40 ms |
| 365-day custom API aggregation, sparse | 88.53 ms | 37.69 ms |
| 396-day console report, 190,080 observations, isolating service grouping | 563.06 ms | 145.65 ms |
| Presence-only heartbeat SQL statements per warmed transaction | 12 | 4 |
| Engagement-only SQL statements per warmed transaction | 10 | 5 |
| Replayed committed raw-event SQL statements per warmed transaction | 10 | 3 |
| Records read to render a 100-row chart table from 1,000 points | 1,000 | 100 |

The aggregation comparison checked 54 complete outputs against the original implementation, including different timezones, daylight-saving transitions, missing/partial coverage, and out-of-order chunks. The service benchmark also checked complete output equality. An additional 100 synthetic memory-analytics report comparisons matched the original implementation.

## Changes

- Metrics history folds build hourly/day buckets directly, avoiding the full report summaries and week hierarchies previously constructed and discarded for each chunk. Exact decimal arithmetic, independent distinct-user counts, earliest peak ties, overflow checks, and partial-hour handling remain intact.
- Completed-hour peaks use a linear scan. Reports reuse their serialized hour buckets and timezone formatters.
- Console activity indexes observations by day once, replacing a scan of the entire retained history for each week. Custom API reports retain only included customer rows after source validation; today's averages accumulate directly from validated chunks.
- Custom/all-time customer lists share filtering and pagination code. Empty searches skip string formatting, and light-cohort sorting does not reorder the cached rankings.
- Analytics skips SQL operations whose event batches are empty or lack the relevant event type. Customer observations and events still commit or roll back together; deduplication and retry behavior are preserved.
- Memory analytics groups facts and events once instead of repeatedly copying arrays, rescanning sessions, and recomputing per-day totals.
- Metrics and Analytics charts reuse formatters and memoized calculations. Heatmap selection updates its own component; chart tables slice the requested page before reversing it. The public pricing/model pages reuse their currency formatter.

Existing route splitting, Playground streaming/persistence batching, shared request coordination, documentation caching, SQL history pagination, and deployment resource limits were retained. No dependency upgrades or schema changes were needed for these improvements.

## Validation

- Full portal suite: 623 tests passed across 71 files, with both analytics and Playground PostgreSQL integrations enabled against the disposable local database.
- Final focused checks: all 15 analytics/database tests and all 6 aggregation regression tests passed, including the added transaction rollback and partial-hour overflow cases.
- Public-site suite: 14 tests passed.
- All workspace typechecks, production builds, lint, provider/content checks, branding checks, and whitespace checks passed.
- The initial unrestricted-parallel baseline run hit an existing Usage-page test timeout. The complete suite passed with four workers without changing that test or its timeout.
- The temporary PostgreSQL instance was stopped after validation. No deployment was performed.

To measure the aggregation on another machine:

```sh
npm run build:bff
node --expose-gc scripts/benchmark-metrics.mjs
```

An optional final argument points to a saved baseline ESM metrics directory containing `activity.js` and its sibling modules. With a baseline supplied, the script checks complete report equality before reporting comparative timings. Source-validation, session-isolation, midnight rollover, refresh, pagination, and authorization regression tests remain in the normal test suite.
