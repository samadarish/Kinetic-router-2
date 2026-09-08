# Customer console changes

Updated September 7, 2026.

This report records the initial implementation. See [Playground and navigation refinement](playground-refinement-report.md) for the current Playground/admin behavior, additional files and endpoints, and final validation totals. Browser counts and validation results below describe the earlier review run.

The customer BFF now serializes explicit public DTOs, including nested objects. Internal billing multipliers and reference costs are absent from customer responses and components. Final model prices and actual billed costs remain visible. The console also has a signed-in text playground, clearer key quota bars and actions, simpler visual styling, and expanded documentation.

Sub2API billing calculations, token accounting, balances, existing billed amounts, the external deployment and inference behavior were not modified. Playground sends use the selected customer's existing key and normal billing; the new quote adapter formats prices for display only. Validation and browser testing used local, in-memory fixtures; no real billable inference requests were made.

## Customer behavior

- Subscriptions shows plan, validity, limits and billed usage without a rate-factor badge.
- Usage keeps actual billed cost, all existing input/output/cache token counts and timing data. Internal standard/reference costs and reasoning-effort presentation are removed from the table, tooltip and CSV. The exported data is explicitly the displayed page.
- Key quota bars compare actual key spend with the configured quota, including small nonzero spend. Unlimited keys are labeled without a misleading percentage bar. Edit, enable/disable and delete are available through a keyboard-accessible three-dot menu; delete still requires confirmation.
- Playground is available only after sign-in. The customer chooses an owned active key and a model available to that key, then receives a streamed final answer. Stop cancels the active request; processed work can still be billed. New chat and leaving the page clear the in-memory conversation. There are no attachments or persistent chat storage.
- Playground shows supported final USD prices per million tokens, optional cache prices and their observation time. Missing, malformed or unsupported pricing rules produce an explicit unavailable-pricing message. The implementation supports fully resolved flat OpenAI token prices only; tiered/context-dependent, peak, time-dependent, non-token or unrecognized rules are not guessed. Normal billing and actual Usage costs still apply when a quote is unavailable.
- Reasoning text, effort controls and separate reasoning-token details are not rendered in the playground. The stream boundary accepts only final text, aggregate token usage and terminal status. Existing aggregate token counts are preserved.
- Public model/pricing pages keep dated dollar reference prices while removing multiplier/savings badges. Documentation explains the distinction between reference prices, current customer quotes and billed usage.

## BFF endpoints

All existing response envelopes, authentication and CSRF requirements remain in place. Schema changes are listed below; price/cost strings preserve their existing decimal values rather than being recomputed at serialization.

| Method and endpoint | Public contract change |
| --- | --- |
| `GET /portal/v1/groups` | Explicit group fields: `id`, `name`, `description`, `platform`, `subscriptionType`. Internal rate fields and unknown additions are omitted. |
| `GET /portal/v1/subscriptions` | Explicit subscription fields and sanitized nested group. Limits, usage and validity preserved. |
| `GET /portal/v1/api-keys` and `GET /portal/v1/api-keys/:id` | Explicit key fields and sanitized nested group. Customer key-management fields, quota windows and actual spend preserved. |
| `POST /portal/v1/api-keys` and `PATCH /portal/v1/api-keys/:id` | Return an allowlisted key when available; otherwise `{ created: true }` or `{ updated: true }`, replacing the raw upstream fallback. |
| `GET /portal/v1/usage/events` | Removes internal `totalCost` and multiplier metadata. Keeps `actualCost`, input/output/cache tokens, timing and pagination. |
| `GET /portal/v1/usage/summary` | Removes `standardCost` from stats, trends and model/group/endpoint breakdowns. Keeps actual billed costs, requests and token totals. |
| `GET /portal/v1/usage/errors` and `GET /portal/v1/usage/errors/:id` | Removes raw `errorBody`. Public message/category/code handling rejects internal billing metadata embedded in debug strings. |
| `GET /portal/v1/dashboard`, `GET/PATCH /portal/v1/me` | Explicit user/dashboard DTOs, including nested platform totals. Customer balances and authoritative totals remain unchanged. |
| `GET /portal/v1/auth/session`, login/TOTP results, `GET /portal/v1/config`, `GET /portal/v1/capabilities` | Explicit user/capability serialization. The existing public-session response remains a minimal allowlisted view. |
| `GET /portal/v1/channels/status`, `GET /portal/v1/redemptions`, `POST /portal/v1/redemptions`, `GET /portal/v1/announcements` | Explicit public DTOs, including nested channel models; no upstream object spreads. Existing customer-safe fields remain. |
| `GET /portal/v1/playground/models?apiKeyId=…` — new | Authenticated, owned-key model list containing only `{ id, name }`. |
| `GET /portal/v1/model-prices?apiKeyId=…&model=…` — new | Available final price DTO (`model`, USD currency, million-token unit, input/output and optional cache prices, observation time) or an explicit unavailable result. Internal quote inputs stay server-side. |
| `POST /portal/v1/playground/chat` — new | Strict `{ apiKeyId, model, messages }` input and allowlisted SSE text/usage/done/error events. Session, key ownership, Origin and CSRF enforced. No automatic retry of billable requests. |

The existing 128 KiB request-body limit now returns a safe HTTP 413 envelope rather than being converted to HTTP 500 by the global error handler. Playground rejects inference redirects, forwards credentials only to its fixed upstream destination, propagates cancellation and sends non-cacheable responses. A rejected model key does not invalidate a valid console session.

## Files changed

The following inventory includes new and modified tracked-source files from this task. The working tree was clean before these changes. Ignored local QA artifacts are listed separately.

### BFF and shared packages

| File | Purpose |
| --- | --- |
| `apps/bff/src/public-serializers.ts` — new | Central field-by-field public serializers for customer entities, aggregates and nested objects. |
| `apps/bff/src/app.ts` | Applies serializers to customer routes, closes raw key-write fallbacks, preserves safe body-limit errors and installs playground routes. |
| `apps/bff/src/public-errors.ts` | Suppresses internal billing identifiers in public error messages/codes. |
| `apps/bff/src/playground.ts` — new | Authenticated model/price/chat endpoints with owned-key selection, bounded validation, safe streaming and cancellation. |
| `packages/portal-contract/src/index.ts` | Removes public multiplier/reference-cost/debug-body fields; adds safe key-write result types and exports playground contracts. |
| `packages/portal-contract/src/playground.ts` — new | Strict request/SSE schemas and public final-price types. |
| `packages/sub2api-client/src/index.ts` | Keeps upstream billing fields in explicitly internal mapper types and exports the new adapter. |
| `packages/sub2api-client/src/internal-types.ts` — new | Separates internal rate/reference-cost/debug fields from public contract types. |
| `packages/sub2api-client/src/playground.ts` — new | Fixed-destination model/chat client, stream allowlist, owned-key reader and exact decimal final-price formatter. |
| `packages/platform-config/src/routes.ts` | Adds canonical and legacy playground routes. |

### Console

| File | Purpose |
| --- | --- |
| `apps/console/src/App.tsx` | Registers the authenticated playground page. |
| `apps/console/src/main.tsx` | Uses status-aware read-query retry policy. |
| `apps/console/src/styles.css` | Simplifies surfaces, typography and spacing; improves responsive tables, quota indicators, row menus and small-screen layout. |
| `apps/console/src/components/PortalShell.tsx` | Adds Playground navigation and simplifies account-shell copy. |
| `apps/console/src/components/QuickIntegration.tsx` | Uses concise, credential-aware Codex examples without assuming WebSocket support. |
| `apps/console/src/components/KeyQuota.tsx` — new | Accessible quota/spend presentation with unlimited and nonzero-use states. |
| `apps/console/src/components/RowActionsMenu.tsx` — new | Focus-managed, viewport-positioned key action menu with keyboard and outside-click behavior. |
| `apps/console/src/components/TokenUsageTrend.tsx` | Clearer labels and stable chart rendering; retains token categories and cache-hit rate. |
| `apps/console/src/components/UsageChart.tsx` | Shows actual billed spend with an honest empty state; avoids unnecessary chart animation/recomputation. |
| `apps/console/src/components/UsageDistributionCard.tsx` | Removes internal reference cost, uses billed-cost labeling and retains accessible distribution values. |
| `apps/console/src/lib/api.ts` | Adds authenticated, CSRF-protected streaming chat requests with bounded timeout and cancellation. |
| `apps/console/src/lib/format.ts` | Preserves readable small nonzero billed amounts and reuses formatters. |
| `apps/console/src/lib/key-quota.ts` — new | Computes display-only quota utilization and bounded progress values without changing quota/spend data. |
| `apps/console/src/lib/playground-state.ts` — new | Builds conversation history and refreshes relevant account/usage queries after a request. |
| `apps/console/src/lib/playground-stream.ts` — new | Validates public SSE events, handles split frames/errors and cancels pending readers. |
| `apps/console/src/lib/query-policy.ts` — new | Retries transient read failures once; avoids retries for authentication, validation and canceled requests. |
| `apps/console/src/pages/ApiKeysPage.tsx` | Integrates quota bars and real key actions; keeps existing write gates, restrictions and confirmation behavior. |
| `apps/console/src/pages/DashboardPage.tsx` | Simplifies dashboard hierarchy/copy while retaining real account metrics. |
| `apps/console/src/pages/ProfilePage.tsx` | Simplifies customer account copy. |
| `apps/console/src/pages/StatusPage.tsx` | Removes technical wording from the page subtitle. |
| `apps/console/src/pages/SubscriptionsPage.tsx` | Removes multiplier presentation and keeps plan limits, usage and validity. |
| `apps/console/src/pages/UsagePage.tsx` | Removes reference-cost and reasoning presentation from table/tooltips/export; keeps billed costs and improves filters/refresh states. |
| `apps/console/src/pages/PlaygroundPage.tsx` — new | Model/key selection, current final prices, streamed text, stop/new-chat states and in-memory conversation handling. |
| `apps/console/src/pages/playground.css` — new | Responsive playground layout and accessible conversation/composer styles. |

### Public site and documentation

| File | Purpose |
| --- | --- |
| `apps/site/app/globals.css` | Calmer public-page surfaces, readable sizes, responsive layouts and documentation/search styling. |
| `apps/site/app/pricing/page.tsx` | Presents final reference dollar prices with clearer account-pricing context. |
| `apps/site/app/quickstart/page.tsx` | Replaces vague setup copy with key, request and usage-verification steps. |
| `apps/site/app/vibe-coding/page.tsx` | Simplifies integration copy and uses shared, credential-aware Codex setup. |
| `apps/site/app/docs/[[...slug]]/page.tsx` | Passes effective plain text alongside corrected HTML and headings. |
| `apps/site/app/docs/search-index.json/route.ts` — new | Publishes a compact index of effective, indexable documentation content. |
| `apps/site/components/site-link.tsx` — new | Uses client navigation for internal public pages while preserving account redirects, external links and downloads. |
| `apps/site/components/home-hero.tsx` | Simplifies headline/layout and improves integration example interaction/copy behavior. |
| `apps/site/components/home-sections.tsx` | Replaces promotional/card-heavy presentation with clearer product and setup information. |
| `apps/site/components/model-card.tsx` | Removes rate-factor badges and preserves final snapshot price values. |
| `apps/site/components/model-detail.tsx` | Removes savings/rate-factor presentation, preserves dollar references and improves code-example interaction. |
| `apps/site/components/pricing-comparison.tsx` | Removes the snapshot multiplier column while retaining input/output and official reference dollar prices. |
| `apps/site/components/public-header.tsx` | Uses internal client navigation consistently. |
| `apps/site/components/public-footer.tsx` | Uses internal client navigation consistently. |
| `apps/site/components/public-account-menu.tsx` | Improves dropdown keyboard focus/navigation and account-menu readability. |
| `apps/site/components/copy-page-button.tsx` | Copies supplied effective guide text; handles clipboard failure and timer cleanup. |
| `apps/site/components/docs-article.tsx` | Handles code-copy failures/timers and internal article navigation while preserving tabs. |
| `apps/site/components/docs-header.tsx` | Adds Ctrl/Cmd+K search, lazy search loading and consistent navigation. |
| `apps/site/components/docs-navigation.tsx` | Uses internal navigation and improves active/sidebar behavior. |
| `apps/site/components/docs-shell.tsx` | Connects effective text to page copying and keeps navigation/content views consistent. |
| `apps/site/components/docs-status-banner.tsx` | Distinguishes updated authored guides from provider availability and reference verification dates. |
| `apps/site/components/docs-search.tsx` — new | Lazy indexed search with focus handling, keyboard navigation, loading/error/retry states and bounded results. |
| `apps/site/data/authored-guides.ts` — new | Step-by-step overlays for existing quickstart, authentication, console, usage, pricing, troubleshooting and integration routes; no archive mutation. |
| `apps/site/data/codex-example.ts` — new | Shared key-environment and provider setup examples without unsupported WebSocket defaults. |
| `apps/site/data/docs-search.ts` — new | Validates search entries and ranks matches across title, headings and body. |
| `apps/site/data/brand.ts` | Makes pending API documentation accurately describe available console prices and billed usage. |
| `apps/site/data/content.ts` | Resolves authored overlays/corrected image documentation consistently for HTML, text, metadata and search. |
| `apps/site/data/docs-navigation.ts` | Renames the WebSocket setup link to a validation guide. |
| `apps/site/data/documentation.ts` | Replaces image billing-factor prose with dated final dollar values and account-capability/pricing caveats. |
| `apps/site/public/install/codex.sh` | Uses an environment-held key and preserves existing Codex config instead of overwriting it; removes unverified WebSocket defaults. |
| `docs/customer-console-change-report.md` — new | Delivery inventory, contract changes, validation and remaining-occurrence explanation. |

The immutable `apps/site/data/reference-manifest.json` remains unchanged: 57 documentation routes, 20 models and 188 active price records. Overlays upgrade existing routes; Playground instructions are a quickstart subsection rather than a new documentation route. `llms.txt` and `llms-full.txt` remain static inventories rather than raw full-page exports.

### Tests added or updated

| File | Coverage |
| --- | --- |
| `test/public-serialization.test.ts` — new | Poisoned upstream and post-mapping fixtures; recursive forbidden-field assertions; normal authenticated route coverage for groups/subscriptions/keys/events and auxiliary customer DTOs; precise billed amounts, token counts, quotas, pagination, sessions and CSRF; safe write acknowledgements and error strings. |
| `test/public-errors.test.ts` | Rejects all billing aliases and reference-cost identifiers embedded in public error messages/codes. |
| `test/usage-analytics.test.ts` | Aligns usage fixtures with the public contract after reference-cost removal. |
| `test/playground.test.ts` — new | Session/CSRF/ownership and model validation, poisoned metadata, streamed text/tokens, no billable retries, safe error handling, body limit, redirects, cancellation and exact/unsupported pricing. |
| `test/platform-config.test.ts` | Validates canonical and legacy playground route mapping. |
| `test/documentation-guides.test.ts` — new | Effective guide HTML/text/headings, preserved routes/status, pricing/cost guidance, safe Codex configuration and image reference prices without a factor. |
| `test/docs-search-input.test.ts` — new | Search-index schema/route validation, safe result fields and keyboard focus movement. |
| `apps/console/src/components/KeyQuota.test.tsx` — new | Quota rendering, accessible labels and unlimited/low-use states. |
| `apps/console/src/components/RowActionsMenu.test.tsx` — new | Menu semantics and keyboard focus calculations. |
| `apps/console/src/components/UsageDistributionCard.render.test.tsx` — new | Billed/token distributions render without internal reference-cost/multiplier fields. |
| `apps/console/src/pages/SubscriptionsPage.test.tsx` — new | Plan validity/billed usage remain while multiplier presentation is absent. |
| `apps/console/src/lib/format.test.ts` — new | Small nonzero dollar amounts, ordinary amounts and missing-value formatting. |
| `apps/console/src/lib/key-quota.test.ts` — new | Quota math/display edge cases without modifying source spend or allowance. |
| `apps/console/src/lib/playground-state.test.ts` — new | Correct request history and authenticated account/usage invalidation. |
| `apps/console/src/lib/playground-stream.test.ts` — new | Split frames, strict public events, terminal failure/end handling and canceled waiting readers. |
| `apps/console/src/lib/query-policy.test.ts` — new | Transient read retries and no retries for canceled/authentication/client failures. |

## Remaining multiplier-related occurrences

The repository-wide audit searched tracked and untracked source/text files, excluding dependencies, builds, caches and generated output; the immutable JSON archive was parsed separately. All eight camel/snake multiplier aliases plus `standardCost`, `standard_cost`, `totalCost` and `total_cost` were searched. Generic `Rate`, savings/discount, `discountRate`, multiplication symbols and numeric `x` forms were classified by context.

There are zero unintended customer-visible multiplier or reference-cost fields. All 57 resolved documentation pages and both llms inventories were also inspected. Remaining exact identifiers are legitimate internal code, negative tests, or this developer report, which is not served by the product.

| Remaining location | Why it is safe |
| --- | --- |
| `packages/sub2api-client/src/index.ts` | Reads upstream `rate_multiplier` and `total_cost` into internal mapped values. Public serializers select customer fields explicitly. Mapping and billed values are unchanged. |
| `packages/sub2api-client/src/internal-types.ts` | Defines internal `rateMultiplier`, `standardCost`, `totalCost` and raw usage-error body fields. These are absent from public types and serialized DTOs. |
| `packages/sub2api-client/src/playground.ts` | Uses authoritative `effective_rate_multiplier` only on the server to format supported final price quotes. Only final amounts/units/observation time leave the BFF. |
| `apps/bff/src/public-errors.ts` | A suppression regex recognizes internal billing identifiers so error/debug strings cannot leak them. |
| Boundary, mapping, playground, formatting and rendering tests | Poisoned input properties and negative assertions prove omission and preservation of actual charges/tokens. Test files are excluded from production browser bundles. |
| `apps/site/data/model-utils.ts` and its `content.ts` re-export | Unused `discountRate` helper compares locked public catalog prices. No component calls or renders it, and it does not read Sub2API account metadata. |
| `apps/site/data/reference-manifest.json` | Original image factor and plan-multiplier prose remain only in the locked reference source. Image HTML/text/headings are corrected at runtime; pending provider-pricing docs serve a replacement body and are excluded from search inventories. The entire archive contains no exact forbidden property aliases. |
| `docs/customer-console-change-report.md` | This developer report intentionally names removed fields and audit results; it is not imported or served by console/site routes. |

Safe generic matches remain: cache-hit percentages in Usage/token charts; rolling USD limits in API Keys; engagement/bounce rates in admin analytics; request throttling in service/docs; SVG `x1`/`x2` coordinates; HTML entity/regex escapes; image dimensions; test pixel densities and local `x64` architecture identifiers. Generic provider cache-discount discussion is dated reference material, not an account multiplier. The archived implementation brief and analytics development documentation are not customer routes.

The image API reference preserves final dollar values ($4.50/M output, $0.75/M text input, $1.20/M reported reference-image input and its dollar examples) with dated-reference caveats. The former factor is absent from resolved HTML, plain text, headings, copied pages and search results.

Detailed local source audit: `.cache/multiplier-audit.md` and `.cache/multiplier-audit.json`. These ignored artifacts include grouped file/line classifications and bounded excerpts; this report retains the explanation for repository review.

## Validation

| Check | Result and evidence |
| --- | --- |
| `npm test` within final `npm run check` | Passed: **260 portal/Vitest tests**, **7 public-site tests**. Five existing PostgreSQL integration tests were skipped because their optional database environment was not configured. |
| `npm run typecheck` | Passed all workspaces, both standalone and within the final check. |
| `npm run check` | **Passed, exit 0**. Includes tests, typechecks, lint, provider/content checks, complete builds and brand checks. Log: `.cache/full-npm-check.log`. |
| Content invariants | Passed: 57 docs, 20 models, 188 active price records; locked reference manifest preserved. |
| Built console scan | Passed across **35 JS/HTML/CSS/map files**: zero eight multiplier aliases, `standardCost`/`totalCost`, or reasoning-effort/content/token field references. Artifact: `.cache/console-bundle-audit.json`. |
| Built public-site client scan | Passed across **44 client JS/JSON/HTML files**: zero forbidden multiplier/reference-cost identifiers or former image billing-factor prose. Artifact: `.cache/site-client-bundle-audit.json`. |
| BFF fixture integration | Passed **21 local fixture checks**, including poisoned nested metadata, exact cost/token preservation, key writes, final price/unavailable states and streamed text. Artifact: `.cache/portal-review-checks.json`. |
| Effective docs audit | Passed all **57 resolved pages** plus llms inventories; no raw billing factors/forbidden property names. Original final image dollar values preserved. |
| Final browser/network review | Passed: **167 captured responses across 14 customer endpoint paths**, with no forbidden metadata, hidden-reasoning sentinels or upstream-token sentinels. No audited response was truncated. Includes complete SSE replies and a canceled stream. Artifact: `.cache/browser-response-audit.json`. |
| Production console browser smoke test | Passed: signed-in page, current final rates and a complete streamed reply from the built console against the isolated BFF. No browser warnings or errors in the production-preview tab. |
| Diff whitespace check | Passed after removing one trailing space; no functional changes after the full check. |

Local browser QA uses an ignored `.cache/portal-review-server.mjs` fixture on loopback and `.cache/portal-review-vite.config.ts`. Upstream account/inference services are replaced by in-memory fixtures, and unmocked outbound fetches are blocked. Fixture key mutations affect only process memory. Its bounded `/__qa/responses` capture records actual browser-visible `/portal/v1` responses while omitting auth response bodies and request credentials. It is not part of production routing. No real credentials are included in this report.

### Final browser evidence

Browser checks used the actual console and public-site applications with a normal authenticated fixture customer, followed by the production console build served through Vite preview. The captured response inventory covered these `/portal/v1` paths (including their query variants):

- `/groups`, `/subscriptions`, `/api-keys`, `/usage/events`, `/usage/summary`.
- `/dashboard`, `/me`, `/channels/status`, `/redemptions`, `/public-session`, `/analytics/bootstrap`.
- `/playground/models`, `/model-prices`, `/playground/chat`.

Authentication response bodies were intentionally omitted from the capture; authenticated route and session envelopes are covered by the BFF integration tests. Error-list/detail, write acknowledgements and other auxiliary serializers are covered by the poisoned-fixture regression tests, including routes without a console screen.

| Browser scenario | Observed result |
| --- | --- |
| API-key quotas | Exact displayed spend and allowance retained; the 92.25% fixture bar uses the warning color. Small nonzero spend remains visible. |
| Three-dot key actions | Opens Edit/Disable/Delete without changing key status. Escape closes the menu and restores the trigger. Edit opens the populated dialog; Cancel leaves the key unchanged. |
| Mobile key table/menu | At 390 pixels, the table scrolls horizontally within its container; the popup stays inside the viewport and the document has no horizontal overflow. |
| Usage and subscriptions | Actual billed costs, token/cache totals, limits and validity remain visible. No multiplier, standard-cost or reasoning-effort presentation appears. |
| Playground complete response | Selected existing key and model produce final text and unchanged aggregate token counts; final rates show amount and unit. |
| Playground Stop | Stops the partial answer and marks it Stopped. The captured SSE response records cancellation rather than a completed fabricated reply. |
| Unavailable price | Clear unavailable-pricing message; Send remains usable, and the selected model completes a reply. Actual billed Usage remains linked. |
| Public account dropdown | Shows the customer name and Dashboard/Profile/Sign out; the generic Customer account subtitle is absent. |
| Documentation | Search finds authored guide content with clean plain-text snippets; a result navigates to the expanded guide. Mobile navigation exposes search. Copy page reports success. Duplicate-key warnings found during review were fixed. |
| Responsive themes | Inspected dark and light layouts for the console/playground and authored documentation; no document overflow at the mobile breakpoint. Temporary viewport overrides were reset. |

Browser testing made no live inference calls and did not verify external model capacity or production pricing configuration. Unsupported or unavailable pricing remains an honest product state. The local fixtures exercise real BFF serialization, authentication, UI navigation and streaming code while keeping all test usage in process memory. No deployment was performed.
