# Playground and navigation refinement

Later change: [per-model Playground identity settings](playground-identity-report.md) add an optional admin-configured instruction. Statements below describe the earlier change.

For the latest compact composer, tab persistence and validation results, see [Compact Playground and tab persistence](playground-persistence-report.md). This report records the preceding refinement.

Updated September 7, 2026. This report supplements [Customer console changes](customer-console-change-report.md) and supersedes that report's Playground behavior and validation totals. The earlier report contains the complete original serializer, Usage, API-key, public pricing and documentation inventory.

The Playground now uses a compact chat layout, Markdown responses, a persistent composer and a right-hand control/status sidebar. Mobile controls collapse above the conversation. The public main navigation includes Playground, including inside the mobile menu: signed-in users open the console; signed-out visitors sign in with a preserved Playground return path. Header navigation is centered, its active underline stays inside the header, and session loading reserves invisible space instead of showing a gray box. Account accents use neutral slate.

Administrators choose models in **Playground settings**. The initial selection is empty. Customers see only enabled IDs that their selected, owned API key can access. The administrator can discover the complete catalog using their own keys or enter exact IDs manually. Image and review models are visible to administrators but reach customers only when explicitly enabled. The Playground still supports text chat only; an enabled model must support that protocol.

Settings use revision checks to prevent overwriting another administrator's changes. Reload preserves the discovered catalog and includes IDs another administrator added. Failed saves require a successful reload before another save. Production uses the existing Redis service; local development without Redis uses an ignored atomic JSON file. No external deployment or infrastructure was changed.

## Customer prices, costs and request behavior

- Model status replaces the persistent price panel. It distinguishes key access, current request state and available channel monitoring. Ambiguous or missing monitoring data is not presented as healthy. Last-request timing identifies the model that actually answered.
- **View rates** retrieves supported final customer prices on demand. **Billed usage** opens actual charged costs. Unsupported pricing remains unavailable rather than being guessed.
- Sends contain the selected key ID, exact model ID and visible user/assistant history. The BFF forwards the existing chat protocol with streaming enabled; it injects no system prompt, examples, reasoning settings or UI metadata. Billable sends are never retried automatically.
- Dedicated reasoning fields, controls and upstream reasoning stream channels remain absent. Arbitrary final-answer text is not semantically filtered. Existing token accounting and reasoning mappings in the inference service are unchanged.
- Ownership, key validity and the current administrator policy are checked on every send. A bounded 30-second sanitized catalog cache avoids repeated model discovery and isolates entries by user, key, group and credential fingerprint.
- Key selection uses paginated ID/name options without fetching key secrets into Playground. Prices do not poll. The shared public session cache deduplicates header/account requests and prevents an old session read from restoring identity after logout.
- First response text is painted immediately; subsequent updates are batched at 50 ms. Stop flushes received text and cancels the stream. Changing selections preserves draft/history. Scrolling up pauses automatic following; New chat clears the conversation.

No billing calculation, token count, account balance, existing charge, external Sub2API deployment or public inference API behavior was modified. Verification used synthetic local inference, with no paid model calls.

## Additional or updated BFF contracts

The original report lists all customer serialization changes, including groups, subscriptions, API keys and usage events. This refinement adds or updates:

| Method and endpoint | Contract and behavior |
| --- | --- |
| `GET /portal/v1/playground/keys` | New paginated `{ items: [{ id, name }], total, page, pageSize, pages }` response. Only valid, active, owned, group-assigned keys become options; no key secrets or group objects. |
| `GET /portal/v1/playground/models?apiKeyId=...` | Still returns only `{ id, name }` entries; now intersects the key catalog with the current administrator policy. |
| `POST /portal/v1/playground/chat` | Same strict input and safe SSE contract; newly enforces the current administrator policy before each send. |
| `GET /portal/v1/admin/playground/settings` | New administrator-only `{ revision, enabledModelIds }` DTO. |
| `PUT /portal/v1/admin/playground/settings` | New strict revisioned write and returned DTO. Requires an active administrator, fresh upstream profile verification, same-origin checks and CSRF. Conflicts return 409; unavailable/corrupt persistence fails closed. |
| `GET /portal/v1/admin/playground/models?apiKeyId=...` | New administrator-only full catalog from an owned key, sanitized to `{ id, name }`. |
| `GET /portal/v1/model-prices` | Existing safe final-price DTO retained; known-disabled pricing capability avoids unnecessary upstream quote calls. |

## Refinement files changed

Paths below are relative to the repository. Files from the earlier implementation are documented separately in the linked original report.

| File | Change |
| --- | --- |
| `apps/bff/src/app.ts` | Inject settings persistence, protect all admin routes, revalidate administrator identity on writes and handle safe local settings errors. |
| `apps/bff/src/index.ts` | Close settings persistence during shutdown. |
| `apps/bff/src/playground.ts` | Add key options/admin routes and enforce model policy; reuse sanitized catalog and gate unsupported price requests. |
| `apps/bff/src/playground-settings.ts` | Memory, atomic development-file and Redis stores with revision conflict protection. |
| `apps/bff/src/playground-catalog.ts` | Bounded sanitized catalog cache with credential isolation and expiry. |
| `packages/portal-contract/src/playground.ts` | Public key option DTO and strict revisioned settings schema. |
| `packages/platform-config/src/routes.ts` | Register the safe administrator Playground route. |
| `apps/console/src/App.tsx` | Lazy administrator settings page with active-admin gate. |
| `apps/console/src/components/PortalShell.tsx` | Playground header navigation, administrator sidebar entry and page layout class. |
| `apps/console/src/components/PlaygroundMessage.tsx` | Memoized Markdown rendering, literal user text, safe links, no remote images/raw HTML, copying and aggregate token display. |
| `apps/console/src/pages/PlaygroundPage.tsx` | Compact chat, sidebar controls/status, on-demand rates, bounded text updates, stable selections and draft/history lifecycle. |
| `apps/console/src/pages/playground.css` | Responsive chat/composer/sidebar styles, Markdown overflow and reduced-motion support. |
| `apps/console/src/pages/PlaygroundSettingsPage.tsx` | Searchable catalog, manual IDs, policy selection, revisioned saves and recoverable reload behavior. |
| `apps/console/src/pages/playground-settings.css` | Responsive administrator editor styling. |
| `apps/console/src/lib/playground-admin.ts` | Prevent late save results from repopulating cache after logout or account/session change. |
| `apps/console/src/lib/playground-buffer.ts` | Immediate first text, batched later updates, final flush and disposal. |
| `apps/console/src/lib/playground-queries.ts` | Shared paginated lightweight key query. |
| `apps/console/src/lib/playground-status.ts` | Conservative exact-match channel status interpretation. |
| `apps/console/src/lib/playground-state.ts` | Refresh actual account/usage queries after sends without triggering price reads. |
| `apps/console/src/styles.css` | Neutral personal-account accent. |
| `apps/console/package.json`, `package-lock.json` | Add `react-markdown` and `remark-gfm`; no existing package versions upgraded. |
| `apps/site/components/public-header.tsx` | Centered navigation, session-aware Playground destination and mobile-menu behavior. |
| `apps/site/components/public-account-menu.tsx` | Shared session read, invisible loading slot and coordinated logout invalidation. |
| `apps/site/components/use-public-session.ts` | Deduplicated external-store subscription and visibility/focus revalidation. |
| `apps/site/data/public-session-cache.mjs` | Bounded shared session reads, explicit public user fields and logout race protection. |
| `apps/site/data/public-session-cache.d.mts` | Typed interface for the shared session module. |
| `apps/site/data/site-config.ts` | Playground entry in public main navigation. |
| `apps/site/app/globals.css` | Matching header/spacer heights, centered links, contained underline and responsive account controls. |
| `apps/site/data/authored-guides.ts` | Expand Playground, administrator setup, status, rates and lifecycle instructions. |
| `README.md`, `docs/playground.md` | Local setup, readiness troubleshooting, administrator policy and persistence guidance. |
| `docs/customer-console-change-report.md`, `docs/playground-refinement-report.md` | Link the original inventory to this current behavior and validation report. |

## Tests added or updated

| Test file | Coverage |
| --- | --- |
| `test/playground-settings.test.ts` | Empty defaults, memory/file persistence, concurrent file-store revision conflicts, corrupt storage and validation. |
| `test/playground-catalog.test.ts` | Redaction, copying, TTL/capacity, user/key/group/credential isolation and uncached failures. |
| `test/playground.test.ts` | Existing safe streaming/price tests plus admin authorization, fresh write verification, policy enforcement, lightweight key pagination/redaction and catalog reuse. |
| `apps/console/src/components/PlaygroundMessage.test.tsx` | Markdown safety, literal user text and compact progress rendering. |
| `apps/console/src/lib/playground-buffer.test.ts` | Immediate first text, Unicode batching, final flush and disposal. |
| `apps/console/src/lib/playground-admin.test.ts` | Late-save protection across user/session/role changes. |
| `apps/console/src/lib/playground-status.test.ts` | Exact, unambiguous status matching and honest unavailable states. |
| `apps/console/src/lib/playground-state.test.ts` | Relevant account refreshes and zero automatic price refetches, including an active query observer. |
| `apps/site/test/public-session-cache.test.mjs` | Shared-read deduplication/expiry, logout races, failed-read retry and signed-in/signed-out Playground destinations. |

Original poisoned-fixture tests in `test/public-serialization.test.ts` continue to verify all forbidden property names recursively in normal authenticated groups, subscriptions, API-key and usage-event responses while preserving required values.

## Validation and browser review

- `npm test`: **290 Vitest tests and 11 site tests passed**. Five existing optional PostgreSQL integration tests skipped.
- `npm run typecheck`: all workspaces passed.
- `npm run check`: passed, including tests, type checks, site lint, provider/content checks, production builds and brand checks.
- Local synthetic BFF verification: **21 route/stream checks passed**.
- Production client audit: **37 console assets and 43 site client files** contain none of the eight multiplier aliases or removed `standardCost`/`totalCost` fields.
- Repository and effective-content audit: all **57 resolved documentation routes** and both llms inventories are free of internal billing-factor exposure; final dollar references remain.
- Browser capture: **173 synthetic HTTP responses** across the original required groups/subscriptions/keys/events endpoints and the new Playground/admin flows contained no forbidden fields or injected upstream credential/reasoning markers. One price request followed the explicit View rates action; no automatic paid-send retry occurred.

Browser review covered desktop and mobile Playground layouts, both themes, compact Markdown streaming, cancellation preserving partial text, selection changes preserving draft/history, New chat, administrator image/review filtering, manual IDs, catalog retention after save, quota bars, key menus, actual-cost Usage and subscription limits. Browser warnings/errors were empty in the final disposable test tabs. The administrator reload candidate fix was subsequently included in the final validation run.

Header measurements at 1440 and 1024 pixels confirmed centered navigation and an underline contained inside the header. At 390 pixels, the mobile Playground menu link preserved the sign-in return path; browser navigation reached `/sign-in?next=%2Fplayground`. The 320-pixel header fits, although the existing homepage code example still has overflow at that narrower size. This is not a claim that every page and viewport is overflow-free. The Docs header retains its separate documentation navigation.

Live model latency, external model availability, production pricing configuration and a live Redis integration were not exercised. File/memory stores and authorization/conflict behavior were tested. Local site and console returned HTTP 200; BFF readiness returned `ready`, upstream `reachable`, sessions `ready`. Disposable fixture services were stopped; the real local development servers remain available.

## Remaining metadata occurrences

There are **zero unintended customer-visible occurrences** of `rateMultiplier`, `rate_multiplier`, `userRateMultiplier`, `user_rate_multiplier`, `resolvedRateMultiplier`, `resolved_rate_multiplier`, `effectiveRateMultiplier` or `effective_rate_multiplier`. Internal reference-cost fields are also absent from the public contracts and audited client output.

| Remaining location | Why it is safe |
| --- | --- |
| `packages/sub2api-client/src/index.ts` | Maps upstream multiplier/reference-cost data into internal objects. Explicit BFF serializers omit those fields. |
| `packages/sub2api-client/src/internal-types.ts` | Server-only type definitions retain upstream fields without placing them in the public DTOs. |
| `packages/sub2api-client/src/playground.ts` | Reads the resolved upstream factor only to format a final customer quote; returns decimal amounts and units, never the factor. Does not modify billing. |
| `apps/bff/src/public-errors.ts` | Suppression pattern prevents internal identifiers in customer error strings. |
| `test/public-serialization.test.ts`, `test/public-errors.test.ts`, `test/playground.test.ts`, `test/playground-catalog.test.ts`, `test/sub2api-mapping.test.ts`, `test/usage-bff.test.ts`, `test/documentation-guides.test.ts` | Intentional negative fixtures, mapper assertions and leak checks; excluded from browser bundles. |
| `apps/console/src/components/UsageDistributionCard.render.test.tsx`, `apps/console/src/pages/SubscriptionsPage.test.tsx`, `apps/console/src/lib/playground-stream.test.ts` | Negative rendering/stream fixtures; excluded from production output. |
| `docs/customer-console-change-report.md`, `docs/playground-refinement-report.md`, `docs/playground.md` | Developer audit/setup documentation, not imported or served as customer product content. |
| `apps/site/data/reference-manifest.json` | Locked source archive retains historical factor prose. Runtime corrected/authored content and pending-route overrides remove it before rendering, copying or search indexing. All 57 effective pages were audited. |

Contextual matches such as cache hit rate, API-key spend limits, request throttling, image dimensions and SVG coordinates are useful unrelated values. The unused `discountRate` helper in `apps/site/data/model-utils.ts` and its re-export in `content.ts` concern static public catalog prices, have no rendering callers and read no Sub2API account metadata. These are not raw billing-multiplier disclosures.

## Test locally

Open `http://localhost:3000` or `http://localhost:5174`. Sign in again if the development BFF restarted. As an administrator, open **Playground settings**, choose a source key, select models and save; real local settings have intentionally not been seeded. Then open **Playground** and select an active key. A real send uses normal billing. See [Playground setup](playground.md) for commands, persistence and troubleshooting.
