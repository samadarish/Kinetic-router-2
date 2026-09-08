# Per-model Playground identity settings

Current saved-chat behavior: [account-backed Playground history](playground-history-report.md).

Implemented locally on 8 September 2026. Administrators can set an optional identity name and knowledge cutoff month/year for each exact model ID. Both fields start blank, can be used independently, and are retained when a model is disabled. Clearing both fields and saving removes the instruction.

The BFF generates one fixed system instruction for a configured model on each Playground send. It uses the settings snapshot already read for authorization, adds no lookup, preserves the exact model ID and visible conversation, and does not cache instructions across sends. The instruction asks the model to answer only the identity detail requested and mention its knowledge cutoff only when specifically asked. Unconfigured requests retain their existing outbound body. No arbitrary system-prompt editor or customer prompt-override field was added.

This setting guides model-generated self-identification; it does not verify the underlying model version or change its training or knowledge. Extra instruction tokens are billed normally. Billing rules, balances, token accounting, inference routing, and the external Sub2API deployment were not modified. No paid inference calls or deployment were performed during validation.

## Files changed for this addition

| Files | Change |
| --- | --- |
| `packages/portal-contract/src/playground.ts` | Strict identity schema with an 80-character single-line name and `YYYY-MM` cutoff; separate canonical settings and update types. Legacy reads default to an empty array while omitted update fields preserve current identities. |
| `apps/bff/src/playground-settings.ts` | Persist identity and enablement together with existing revision and atomic file/Redis behavior. Normalize old records on read without rewriting them. |
| `apps/bff/src/playground-identity.ts` | Generate the fixed, optional instruction from explicitly configured details. |
| `apps/bff/src/playground.ts` | Explicit admin settings serialization and server-side identity selection for each send. Customer catalogs and SSE DTOs remain unchanged. |
| `packages/sub2api-client/src/playground.ts` | Accept an internal request option that prepends one system message. Existing streaming, cancellation, model ID, output limit, and usage handling remain intact. |
| `apps/console/src/pages/PlaygroundSettingsPage.tsx`, `apps/console/src/pages/playground-settings.css` | Compact expandable identity editor, native month input, clear action, validation, draft preservation, metadata-only saves, responsive layout, and guarded reload/save completion. |
| `apps/console/src/lib/playground-identity-editor.ts` | Normalize and compare independent model drafts; validate the complete update and its UTF-8 size before saving without truncating input. |
| `apps/console/src/lib/playground-admin.ts` | Account-scoped private settings cache and session-owner guard. |
| `test/playground.test.ts`, `test/playground-settings.test.ts`, `test/playground-settings-redis.test.ts` | HTTP/gateway, schema, persistence, and Redis command-protocol regression coverage. |
| `apps/console/src/lib/playground-admin.test.ts`, `apps/console/src/lib/playground-identity-editor.test.ts` | Owner isolation, metadata dirty state, normalization, clearing, disabled identities, validation, and request-size coverage. |
| `README.md`, `docs/playground.md`, `apps/site/data/authored-guides.ts` | Setup, customer behavior, normal billing of instruction tokens, local testing, and upgrade/rollback guidance. |
| `docs/playground-refinement-report.md`, `docs/playground-persistence-report.md` | Link earlier reports to this subsequent identity change; correct the Redis service wording. |
| `docs/playground-identity-report.md` | This delivery record. |

## BFF contract

Only the admin settings schema changes in this addition:

- `GET /portal/v1/admin/playground/settings` returns `modelIdentities: [{ modelId, name?, knowledgeCutoff? }]` alongside revision and enabled IDs.
- `PUT /portal/v1/admin/playground/settings` accepts that optional array and returns the full canonical settings. Omission preserves saved identities; `[]` explicitly clears them. Empty per-model entries and arbitrary prompt fields are rejected.
- `POST /portal/v1/playground/chat` retains its strict customer input and public SSE schemas. The optional instruction is an internal outbound change only.
- Customer model lists and other customer endpoints receive no identity configuration metadata.

Deploy the updated BFF before the console and update all BFF instances before allowing settings writes. **Any settings save by this version**, even with an empty identity array, creates a record the previous strict BFF cannot read. Do not mix old and new BFFs after saving. See [upgrade and rollback instructions](playground.md#local-development).

## Validation

- `npm run check` passed, including `npm test`, `npm run typecheck`, lint, provider/content checks, all builds, and brand checks.
- 331 portal/Vitest tests and 11 site tests passed. Five existing optional PostgreSQL integration tests were skipped. This adds 23 passing tests compared with the preceding 308-test portal suite.
- New coverage verifies legacy reads/writes, nested copy isolation, disabled/re-enabled identities, clearing, revision conflicts, name/month validation, duplicate/oversized entries, exact configured and unconfigured outbound requests, current settings per send, public redaction, rejected customer overrides, cancellation, and no automatic billed retry.
- Redis tests use a mock to verify raw-record CAS, omission/clearing, conflict handling, corrupt data, and uncertain write errors. No live Redis or PostgreSQL integration was run.
- Local synthetic admin browser checks verified blank defaults, editing a disabled model, name/cutoff preservation through filtering and source-key changes, save/reload persistence, re-enabling, explicit clearing, native invalid-month handling (including filtered-out rows), and desktop/mobile layouts. A collapsed invalid cutoff editor reopens and focuses the field with a readable error. The mobile layout at 390px has no horizontal overflow.
- The local fixture suite also passed 21 route/stream checks across normal customer endpoints.
- Synthetic browser inference verified one system message followed by the visible user message. Captured customer model/SSE responses retained their existing schemas without identity metadata or billing multipliers.
- Production asset scan passed: 38 console assets and 45 site client files contain none of the eight multiplier aliases or raw reference-cost fields. The fixed server instruction text is absent from both browser builds. `git diff --check` also passed.
- Full validation log: ignored `.cache/playground-identity-check.log`. Synthetic browser evidence: ignored `.cache/playground-identity-browser-responses.json`.

## Billing metadata audit

The earlier customer serialization changes remain intact. Production console source and public contracts have no raw multiplier aliases or `standardCost`/`totalCost` references. Final customer prices and actual billed costs remain available.

Remaining exact fields are confined to server-side upstream mapping/internal types, the final-price conversion adapter, public-error suppression patterns, poisoned fixtures/negative assertions, and developer reports. Contextual customer text about cache hit rate or account spend/rate limits is unrelated to internal billing multipliers. The locked documentation archive remains source provenance; effective documentation is checked after its existing runtime corrections. See [the original customer-boundary report](customer-console-change-report.md) for the per-file reasons.

The repository-wide audit covered 267 source/text files and all 57 effective documentation pages. Every exact remaining match is accounted for below; production browser assets are checked separately.

| Remaining file | Why it is safe |
| --- | --- |
| `apps/console/src/components/UsageDistributionCard.render.test.tsx` | Poisoned upstream fixtures and negative assertions verify that internal identifiers/values cannot appear in customer data or rendering. Test source is not included in production browser bundles. |
| `apps/console/src/lib/playground-stream.test.ts` | Poisoned upstream fixtures and negative assertions verify that internal identifiers/values cannot appear in customer data or rendering. Test source is not included in production browser bundles. |
| `apps/console/src/pages/SubscriptionsPage.test.tsx` | Poisoned upstream fixtures and negative assertions verify that internal identifiers/values cannot appear in customer data or rendering. Test source is not included in production browser bundles. |
| `docs/customer-console-change-report.md` | Developer delivery report records removed field names and their remaining internal/test occurrences. It is not imported or served by the public site or console. |
| `docs/playground-identity-report.md` | Developer delivery report for optional identity instructions and regression audit; not served product content. |
| `docs/playground-refinement-report.md` | Developer delivery report records internal field names and audit results; not served product content. |
| `packages/sub2api-client/src/index.ts` | Upstream-to-internal mapping retains rate_multiplier and raw total_cost calculations. The BFF explicitly selects public fields; billing/token accounting is unchanged. |
| `packages/sub2api-client/src/internal-types.ts` | Internal types retain multiplier/reference-cost fields, and raw usage errorBody, for server code only. Public Group/Usage contracts omit them. |
| `packages/sub2api-client/src/playground.ts` | The server reads effective_rate_multiplier to format the customer final quote. Only final decimal price strings and units leave the BFF, never the factor or source object. It does not change billed requests. |
| `test/documentation-guides.test.ts` | Poisoned upstream fixtures and negative assertions verify that internal identifiers/values cannot appear in customer data or rendering. Test source is not included in production browser bundles. |
| `test/playground-catalog.test.ts` | Poisoned upstream fixtures and negative assertions verify that internal identifiers/values cannot appear in customer data or rendering. Test source is not included in production browser bundles. |
| `test/playground.test.ts` | Poisoned upstream fixtures and negative assertions verify that internal identifiers/values cannot appear in customer data or rendering. Test source is not included in production browser bundles. |
| `test/public-errors.test.ts` | Poisoned upstream fixtures and negative assertions verify that internal identifiers/values cannot appear in customer data or rendering. Test source is not included in production browser bundles. |
| `test/public-serialization.test.ts` | Poisoned upstream fixtures and negative assertions verify that internal identifiers/values cannot appear in customer data or rendering. Test source is not included in production browser bundles. |
| `test/sub2api-mapping.test.ts` | Tests internal mapper reference calculations and cache hit rate. Separate boundary tests ensure the mapped internal fields are not public. |
| `test/usage-bff.test.ts` | Poisoned upstream fixtures and negative assertions verify that internal identifiers/values cannot appear in customer data or rendering. Test source is not included in production browser bundles. |

`apps/bff/src/public-errors.ts` also contains a combined suppression pattern for these field families; it removes unsafe metadata from error text rather than exposing it.

No real model identities were populated. To try this locally, sign in as an active administrator at `http://localhost:5174/admin/playground`, expand a model's **Identity**, enter verified details, and save. Start a new Playground chat for a clean self-identification test; sending a real message incurs normal usage charges.
