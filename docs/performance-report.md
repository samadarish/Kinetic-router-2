# Performance improvements — September 13, 2026

Implemented focused loading, rendering, request-coalescing, and static-content improvements. The design, features, HTTP contracts, database schemas, and dependency versions remain unchanged.

## Measured results

| Measurement | Before | After |
| --- | ---: | ---: |
| Console initial static JavaScript | 425,035 bytes | 309,568 bytes |
| Sum of gzip sizes for those initial chunks | 131,528 bytes | 97,837 bytes |
| Saved-chat detail requests during overlapping open/refresh | 2 | 1 |
| Saved-row date formatting during 20 draft changes with 100 loaded chats | Repeated on each render | 0 additional calls |
| Saved-row date formatting during streamed text with 100 loaded chats | Repeated on each render | 0 additional calls |

The console's initial JavaScript is 27.2% smaller uncompressed and 25.6% smaller by summed gzip size. Both bundle measurements used fresh production builds with rebuilt shared packages. The initial static dependency graph now excludes signup, Zod, stream parsing, and the conversation controller. Deferred routes still load and use their existing validation.

All 57 documentation pages produced the same 3,627,521-byte serialized result before and after caching, covering metadata, status, copy text, rendered HTML, and table of contents. SHA-256: `180dd6d76c9fe8e376675b314af8563502e131c2df9d7b2cbf7aeef71ededb79`. Looking up all 57 warmed pages and presentations took approximately 0.006 ms median locally; this is an isolated lookup measurement, not production response time.

Live analytics now appends to invocation-local grouping arrays. The audit's synthetic 10,000-tab grouping benchmark was approximately 117 ms with repeated copying versus 1.9 ms with appends. This is not a production endpoint benchmark.

## Changes

- Signup and the Playground runtime load on demand. The view and runtime warm together on first Playground navigation, and the controller stays above route changes afterward.
- Lightweight auth storage cleanup removes both legacy transcripts and current drafts, including logout before Playground initializes. Legacy import retains its narrower cleanup behavior.
- Generic API requests no longer import SSE parsing or runtime validation. Streaming continues to use the current CSRF token, existing timeout, cancellation, and strict event validation.
- Concurrent equivalent chat reads share transport promises while retaining latest-caller generation checks. Writes prevent subsequent refreshes from joining pre-write requests. History merges retain their original ordering and duplicate precedence.
- Saved-chat rows are memoized independently of transcript updates and status controls. Usage chart imports begin alongside the page's queries.
- Model discovery coalesces matching pending requests while retaining credential/user isolation, successful-result TTL, independent caller cancellation, retry behavior, and bounded coordination.
- Analytics reuses a bounded timezone formatter cache. Remote transcript stores skip irrelevant legacy reads and persistence timers.
- Known documentation routes reuse resolved content and presentation. Unknown URLs are not retained, and cache lifetime follows the module/deployment.

## Validation

- `npm run check` passed: 478 application/backend tests plus 14 public-site tests, workspace typechecks, lint, provider/content checks, all production builds, and brand checks.
- Five PostgreSQL-dependent tests remain skipped because no disposable test database was configured. No database code or schema was changed.
- Added regression coverage for shared reads, stale replies after writes/logout, cancellation/refcount races, cache expiry/eviction/isolation, retry after failure, storage cleanup, remote-store behavior, documentation reuse, timezone boundaries/DST, grouping/pagination, and streaming transport.
- A local browser harness with synthetic data verified actual React provider behavior in StrictMode: deferred initialization, logout before first use, stable history rows during typing/streaming, navigation to Usage and back during a reply, retained controller/text, and logout abort/cleanup. It used no real account or billed inference requests.
- Public homepage and documentation navigation were checked locally. Full-page content equivalence was checked independently of the browser.

## Deferred work and release boundaries

Font partitioning, broader server-content splitting, database-retention tuning, framework upgrades, and incremental Markdown rendering remain separate measured follow-ups.

The public website uses Sites. Console and BFF artifacts use the separate VPS deployment described in `deploy/README.md`; publishing a Sites version does not deploy those services. These changes require no migration or new runtime configuration.
