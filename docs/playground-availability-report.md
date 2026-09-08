# Global Playground availability

Implemented a saved **Enable Playground** switch under `/admin/playground`. It defaults on, hides customer navigation when off, and rejects new customer Playground API requests. Saved chats, model selections, identities, billing, token accounting and gateway routing are unchanged. Admin settings, discovery and inspection remain available. Existing admitted replies can finish and save.

## Files changed for this setting

Paths below describe this change only; the checkout also contains earlier console and Playground work.

| Files | Change |
| --- | --- |
| `packages/portal-contract/src/playground.ts`, `packages/portal-contract/src/index.ts` | Typed global availability on canonical settings and session views; optional update field preserves legacy writes. |
| `apps/bff/src/playground-settings.ts` | Persist the switch through existing memory/file/Redis stores and revision checks. Legacy records default on; public availability reads fail closed. |
| `apps/bff/src/playground.ts` | Guard all customer Playground routes before account or inference work; keep admin key/model discovery available. |
| `apps/bff/src/app.ts` | Return fresh, customer-safe availability in login and session responses. |
| `apps/console/src/lib/auth.tsx`, `apps/console/src/lib/auth-cache.ts` | Refresh availability through existing session queries; cancel pending session reads at logout. |
| `apps/console/src/App.tsx`, `apps/console/src/components/PortalShell.tsx`, `apps/console/src/pages/UsagePage.tsx` | Hide customer links and redirect disabled direct visits to the dashboard. |
| `apps/console/src/pages/PlaygroundSettingsPage.tsx`, `apps/console/src/pages/playground-settings.css`, `apps/console/src/lib/playground-identity-editor.ts`, `apps/console/src/lib/playground-admin.ts`, `apps/console/src/lib/playground-queries.ts` | Switch UI, atomic save with existing settings, immediate availability update, and independent admin discovery. |
| `apps/console/src/lib/playground-context.tsx`, `apps/console/src/lib/playground-conversations.ts` | Prevent new activity and background history requests while disabled without aborting an admitted reply or deleting local drafts. |
| `apps/site/data/public-session-cache.mjs`, `apps/site/data/public-session-cache.d.mts`, `apps/site/components/use-public-session.ts` | Shared foreground polling, strict availability parsing, safe initial/failure states and watcher cleanup. |
| `apps/site/components/public-header.tsx`, `apps/site/components/docs-article.tsx`, `apps/site/data/authored-guides.ts`, `apps/site/app/globals.css` | Hide public desktop/mobile navigation and documentation shortcuts when unavailable. |
| `docs/playground.md` | Admin instructions, refresh behavior, compatibility and recovery guidance. |

## BFF contract changes

- `GET /portal/v1/admin/playground/settings`: adds `playgroundEnabled`.
- `PUT /portal/v1/admin/playground/settings`: accepts optional `playgroundEnabled`; omission preserves the saved value.
- `GET /portal/v1/auth/session`, `GET /portal/v1/public-session`: add fresh `playgroundEnabled`, including for anonymous visitors.
- Successful password/TOTP login responses include `playgroundEnabled`.
- `GET /portal/v1/admin/playground/keys`: new admin-only discovery route returning key IDs and names.
- All `/portal/v1/playground/*` customer endpoints return `403 PLAYGROUND_DISABLED` when off, including for an admin using customer endpoints. Existing successful payload shapes are unchanged.
- `/portal/v1/model-prices` remains available independently for customer pricing transparency.

## Tests and validation

- `test/playground.test.ts`: user/admin blocking, fresh session visibility, settings failure, preserved history and active-stream completion; admin key discovery authorization.
- `test/playground-settings.test.ts`, `test/playground-settings-redis.test.ts`: defaults, persistence, invalid booleans, revision conflicts and preservation of a disabled switch through legacy writes.
- `test/playground-conversations.test.ts`: completed replies survive disabling; history resumes on re-enable; disabling during chat creation prevents inference.
- `apps/console/src/lib/auth-cache.test.ts`, `apps/console/src/lib/playground-admin.test.ts`: pending session responses cannot overwrite logout or the freshly saved switch; save results cannot cross account/session boundaries.
- `apps/console/src/lib/playground-identity-editor.test.ts`, `test/bff-security.test.ts`: updated canonical settings/session fixtures.
- `apps/site/test/public-session-cache.test.mjs`: anonymous visibility, strict/failure handling, late logout responses, shared 60-second foreground polling and cleanup.

`npm run check` passed, including `npm test`, `npm run typecheck`, lint, provider/content checks, production builds and brand checks: **381 portal tests + 14 public-site tests passed; 5 database integration tests skipped** because their optional test database was not configured. Redis command tests use a mock. Git whitespace checks passed.

Local browser review used isolated synthetic account and inference fixtures. Turning the switch off hid public/console links; a direct Playground visit returned to the dashboard; Usage retained billed costs; admin model discovery and chat inspection remained usable. Re-enabling restored selected models and navigation. The signed-out public link still directs to login with the Playground return path. No real setting, balance or gateway was changed for QA, and no paid inference request was sent. Temporary review servers were stopped; the regular local app remained available.

## Multiplier audit

No multiplier aliases occur in the built console or built public-site client source. Captured customer-facing browser fixture responses also contained no multiplier aliases or upstream session tokens.

Remaining production-source occurrences are confined to `packages/sub2api-client/src/internal-types.ts`, `index.ts`, and `playground.ts`: upstream/internal types and the existing server-side calculation of final customer prices. The BFF exposes explicit public DTOs. Remaining test occurrences deliberately poison upstream fixtures or assert absence from customer output. Existing audit-report occurrences document those checks. There are no unintended customer-visible occurrences.
