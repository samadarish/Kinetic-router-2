# Security and performance review — 2026-09-22

Reviewed authentication/session handling, the account client, support tickets and
images, realtime delivery, console caches, Playground history and streaming,
public-site integration, analytics/metrics, deployment configuration, and npm
dependencies. Existing product features and authorization boundaries are retained.

## Fixes

| Area | Finding and correction |
| --- | --- |
| Authentication | Empty/malformed upstream login results could create local sessions with empty identities and credentials. Password, TOTP, refresh, and onboarding now share strict token validation; successful sign-in also requires a valid active user. Invalid TOTP challenges are rejected. |
| Session ownership | Profile/dashboard responses could replace the session's user ID. Profile reads/writes now validate the response and require the existing ID; the session update also independently enforces identity. |
| Account responses | Successful HTML, malformed JSON, and interrupted bodies could appear successful. These now return errors. Buffered account responses have a 16 MiB default limit, with existing per-request limits supported. Valid no-content writes remain supported. Error envelopes delivered with HTTP 200 now receive an error status. |
| Account changes | Session polling could retain another account's cached dashboard, keys, or tickets. Account transitions cancel and remove account queries before publishing the new session and clear the previous account's text/image drafts. Initial page loads preserve saved drafts. |
| Support realtime | Redis recovery could register additional callbacks and deliver each event multiple times. Reconnection reuses a stable callback. |
| Stream caching | Hono replaced the support stream's intended cache directives. Both customer/admin responses now retain `private, no-store, no-transform`. |
| Support roles | An administrator could create a customer ticket through the JSON endpoint. The route rejects this before parsing or persistence. |
| Stream parsing | Valid coalesced chunks could exceed the buffer limit despite containing small events. The readers now bound individual lines/events and incomplete data. Newline separators count toward limits, including repeated empty data lines. |
| Playground history | Focus refresh discarded loaded older messages and reset pagination. Contiguous retained history is preserved; eviction/gaps reset pagination appropriately. Late older-page results cannot overwrite a newer page boundary. |
| Support rendering | Date formatters were allocated repeatedly for each message during typing. Four fixed formatters are reused and message bubbles are memoized. |
| Production theme | The inline console theme bootstrap was blocked by production CSP. Builds now emit a hashed, synchronous same-origin script without relaxing CSP. |
| Proxy identity | Caddy forwards one verified client IP to the BFF. The deployment runbook explains conditional Cloudflare trusted-proxy setup to avoid sharing authentication limits across an edge address. |

## Dependency updates

The npm audit moved from **12 affected packages** (1 critical, 10 high, 1 low)
to **0 known vulnerabilities**, including development dependencies.

| Dependency | Before | After |
| --- | --- | --- |
| sharp | 0.34.5 | 0.35.4 |
| Next.js / eslint-config-next | 16.2.6 | 16.3.5 |
| React / React DOM / React server DOM | 19.2.6 | 19.2.8 |
| vinext | 1.0.0-beta.3 | 1.0.0-beta.11 |
| Cloudflare Vite plugin | 1.37.1 | 1.57.2 |
| Wrangler | 4.92.0 | 4.136.2 |
| Vite RSC plugin | 0.5.26 | 0.5.35 |

The workspace lockfile records the compatible transitive changes. Relevant
upstream references include the [React server-function advisory](https://github.com/react/react/security/advisories/GHSA-wx67-qw84-cm4g),
[sharp/libheif advisory](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c),
and [Next.js security advisories](https://github.com/vercel/next.js/security/advisories).

## Verification

- Vitest: **855 passed, 33 skipped** across 89 test files, using four workers.
- Public-site tests: **14 passed**.
- All workspace type checks, public-site lint, provider/content checks, and brand checks passed.
- Full production build passed; final console and backend changes were rebuilt successfully.
- Emitted console HTML references the hashed theme asset synchronously and contains no inline theme bootstrap.
- npm audit: **0 vulnerabilities**. Dependency tree validation and Git whitespace checks passed.
- Local HTTP smoke checks returned 200 for the public home, docs, and models pages, console sign-in, and BFF liveness.

The local Docker engine was unavailable. PostgreSQL integration tests and real
Redis reconnects were not run; Redis recovery has a regression test modeling its
retained callback sets. Deployed Cloudflare/Caddy behavior and real-account
authentication were not exercised. The conditional database tests account for
most skipped cases; some skips select the appropriate persistence implementation.

Changes are local and have not been deployed. The development servers were
restarted after upgrading locked dependencies. Local in-memory sessions are
cleared by a backend restart, so existing development browsers may need to sign
in again. Production Redis session persistence is unchanged.
