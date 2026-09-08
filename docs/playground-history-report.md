# Saved Playground conversations

Implemented September 8, 2026. This extends the earlier [billing boundary and console changes](customer-console-change-report.md), [Playground refinements](playground-refinement-report.md), and [identity settings](playground-identity-report.md). Current operating instructions are in [Playground setup](playground.md).

## Behavior

- The history/status panel is on the left. API key and model selectors remain beneath the compact composer.
- Sent prompts and replies are saved in PostgreSQL per customer. Chats survive navigation, logout, server restart and sign-in on another device. Each conversation has independent draft/selection state in the current browser tab; unsent typing is not recorded server-side.
- New chat preserves older conversations. Switching chats does not retarget an active reply. Stop and disconnect save partial output; requests are never automatically resent.
- Customers can remove a chat from their history. The control describes removal from the chat list without claiming permanent deletion.
- Optional legacy-tab import records text/model labels with imported provenance. It does not trust browser-supplied token usage or timing.
- All stored text remains available through transcript pagination. Inference receives only this chat's newest contiguous turns fitting 40 messages and 128 KiB, including the current prompt and optional existing identity instruction. No summaries or extra inference requests are generated.

## Files changed in this iteration

| Files | Change |
| --- | --- |
| `packages/portal-contract/src/conversations.ts`, `index.ts`, `playground.ts` | Explicit chat/turn DTOs, strict mutation schemas, saved-turn stream acknowledgement. |
| `apps/bff/src/conversations.ts` | Public serializers, storage interface, context window, and injected memory test fixture. |
| `apps/bff/src/conversations-postgres.ts` | Durable storage, additive tables/indexes, owner locks, stable pagination cursors, lease recovery and transactional purge/audit. |
| `apps/bff/src/conversation-routes.ts` | Customer and admin history endpoints with explicit output allowlists. |
| `apps/bff/src/playground.ts` | Commit before inference, server-built context, serialized checkpoints, final-save acknowledgement, cancellation and safe storage errors. |
| `apps/bff/src/app.ts`, `config.ts`, `index.ts` | Store wiring, import body limit, configuration and shutdown. |
| `apps/console/src/lib/playground-conversations.ts` | Account-scoped multi-chat coordinator, per-chat streaming, race protection, drafts, pagination and optional import. |
| `apps/console/src/lib/playground-context.tsx`, `playground-store.ts`, `api.ts` | Retained provider lifecycle, remote-backed conversation drivers, and the new turn request payload. |
| `apps/console/src/pages/PlaygroundPage.tsx`, `playground.css`, `components/PlaygroundHistory.tsx` | Left history panel, per-chat URL navigation, removal/import dialogs, compact composer, context/loading/background states. |
| `apps/console/src/pages/PlaygroundChatsPage.tsx`, `playground-chats.css` | Read-only administrator inspector and archived-chat purge confirmation. |
| `apps/console/src/App.tsx`, `components/PortalShell.tsx`, `components/PlaygroundMessage.tsx` | Admin route/navigation, exact active-link highlighting, and accurate customer labels in inspected transcripts. |
| `test/playground.test.ts` | Adapted BFF tests to the new protocol; added history, authorization, archive/purge, context isolation, import, duplicate and failed-save coverage. HTTP cancellation also verifies the saved partial snapshot. |
| `test/playground-history.test.ts` | Shared memory/PostgreSQL tests for durability, owner isolation, concurrency, cursor stability, leases, pagination, purge/audit and DTO sanitization; context budget tests. |
| `test/playground-conversations.test.ts` | Nine controller regressions covering cross-chat streams, reloads, drafts, stale fetches, deletion races, ownership changes, Stop and import. |
| `scripts/playground-dev-db.mjs`, `package.json`, `.env.example` | Persistent local database helper and configuration instructions. The ignored local `.env` was pointed at this helper. |
| `README.md`, `docs/playground.md`, `apps/site/data/authored-guides.ts` | Updated setup, customer usage, storage/retention and administrator instructions. |
| `docs/playground-persistence-report.md`, `docs/playground-identity-report.md`, this report | Linked historical reports to the current saved-chat behavior. |

Pre-existing working-tree changes were preserved. No deployment files, external services, inference API routes, billing calculations, token accounting, balances or charged amounts were changed by this iteration.

## BFF contract changes

| Endpoint under `/portal/v1` | Contract |
| --- | --- |
| `POST /playground/chat` | Now accepts `conversationId`, `revision`, `clientTurnId`, `apiKeyId`, `model`, and `message`. Rejects the former client `messages` payload with a refresh-required conflict. Emits `turn_started` followed by the existing safe text/usage/terminal events. |
| `GET /playground/conversations` | Paginated customer-safe summaries with stable cursors. |
| `POST /playground/conversations` | Idempotent owner-scoped conversation creation. |
| `GET /playground/conversations/:id` | Owner-scoped transcript pages and summary. |
| `DELETE /playground/conversations/:id` | Removes the conversation from that customer's history. |
| `POST /playground/conversations/import` | Strict text-only import with provenance; scoped 2 MiB request limit. Other requests retain the existing 128 KiB limit. |
| `GET /admin/playground/conversations` | Admin-only filtered summaries including owner, removal and import metadata. |
| `GET /admin/playground/conversations/:id` | Admin-only read-only transcript, including removed chats. |
| `DELETE /admin/playground/conversations/:id` | Admin-only permanent purge of already-removed conversations; audit entry survives. |

The previously sanitized `/groups`, `/subscriptions`, `/api-keys`, and `/usage/events` schemas remain sanitized. Actual billed costs and final customer model prices remain available.

## Validation

- `npm run check` passed, including `npm test`, `npm run typecheck`, lint, provider/content validation, production builds and brand checks. The suite reports **357 Vitest tests passed, 5 pre-existing optional analytics database tests skipped**, plus **11 public-site tests passed**.
- PostgreSQL integration was run against uniquely named test schemas in the local development database: **67 focused tests passed**, including **8 additional PostgreSQL cases** beyond default memory/BFF coverage. These check a replaced store instance, owner isolation, concurrent sends, archived data and audit retention, cursor updates/purge, transcript pagination, imports and crash recovery.
- Browser review used a separate synthetic account/inference fixture on ports 5175/3102, with external fetch disabled and in-memory test data. Verified left-side layout, saved replies and exact reported token totals, switching during a response, background Stop, customer removal and retained read-only admin inspection.
- Audited actual fixture-browser JSON responses and the built console. No internal billing metadata aliases or upstream access tokens were exposed. Synthetic inference requests contained only `model`, `messages`, `stream`, `stream_options`, and the existing `max_completion_tokens`; unconfigured test models received no system instruction.
- The browser's automatic approval review blocked the permanent-delete button test, treating it as unauthorized irreversible transcript deletion despite the synthetic fixture. That browser interaction remains untested; its store/BFF behavior passed the isolated tests before the rejection. No real customer chat was purged.
- Desktop browser review was completed; a dedicated mobile viewport run was not performed. Responsive styles are included.

## Remaining multiplier/reference-cost occurrences

Source audit excludes dependencies, Git metadata and ignored local caches; the production console bundle was checked separately.

| Remaining location | Why it is safe |
| --- | --- |
| `packages/sub2api-client/src/internal-types.ts` | Explicit server-side internal group and usage reference fields. These are not public response DTOs. |
| `packages/sub2api-client/src/index.ts` | Reads upstream multiplier/reference-cost inputs for server consumers; BFF responses select public fields explicitly. |
| `packages/sub2api-client/src/playground.ts` | Uses the authoritative effective multiplier only to calculate transparent final quoted customer prices; does not perform or modify billing. |
| BFF, adapter and frontend `*.test.ts(x)` files | Deliberately poisoned fixtures and assertions that forbidden fields/text are absent. Tests are not included in the customer bundle. |
| Change reports in `docs/` | Descriptions of the audit and removed fields, not runtime customer data. |

There are **zero unintended public multiplier/reference-cost fields**, and no matches in production console source or its built bundle. The public contract contains no multiplier fields. User-authored chat text is retained as text; it is not scrubbed merely for mentioning a field name.

## Local testing

The app remains available at `http://localhost:5174/sign-in`, with the public site at `http://localhost:3000`. The persistent Playground database runs on loopback port 55433 and survives app restarts. Model settings and real account balances were not changed. Sign in again after a development BFF restart; sending a message with a real key still incurs normal usage charges.

Crash recovery preserves the latest committed checkpoint, not text received afterward. PostgreSQL availability is required for new sends. The temporary browser fixture is separate from the real local app and is stopped after review.
