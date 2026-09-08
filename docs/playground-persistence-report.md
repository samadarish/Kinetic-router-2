# Compact Playground and tab persistence

Current saved-chat behavior: [account-backed Playground history](playground-history-report.md).

Later change: [per-model Playground identity settings](playground-identity-report.md) add an optional admin-configured instruction. Statements below describe the earlier change.

Updated September 7, 2026. This supersedes the conversation lifetime and layout descriptions in [the earlier refinement report](playground-refinement-report.md). [Playground setup](playground.md) contains the current customer and administrator instructions.

The conversation now survives console navigation and full refreshes in the same browser tab. An active response continues while another console page is open. Refreshing or leaving the console document stops the connection and restores received text as Stopped, without resending. Sign-out, session loss and account changes clear saved chat data.

The chat's outer card and redundant header are removed. One compact composer contains the message input, API-key/model selectors and Send/Stop. The narrower sidebar places Model status directly below New chat, followed by final rates and billed Usage. Mobile keeps selectors in the composer and collapses status/rates below New chat. Message spacing and typography are tighter, with a smaller empty state.

## Files changed

| File | Change |
| --- | --- |
| `apps/console/src/lib/playground-storage.ts` | Versioned, explicitly serialized, user-scoped tab snapshot; validation and safe memory-only fallback. No credential or query-response fields are stored. |
| `apps/console/src/lib/playground-store.ts` | Route-independent conversation/stream ownership, immutable snapshots, 250ms persistence, immediate terminal saves, Stop/New chat handling and stale-callback guards. |
| `apps/console/src/lib/playground-context.tsx` | Stable provider and external-store subscription; account cleanup, visibility flush and page-unload handling. Background text updates do not rerender unrelated pages. |
| `apps/console/src/App.tsx` | Place the user-keyed provider above protected route content that remounts on navigation. |
| `apps/console/src/lib/auth.tsx` | Stop an active request when sign-out starts; remove retained storage on a confirmed anonymous session. Initial authentication loading preserves storage. |
| `apps/console/src/lib/playground-queries.ts` | Scope key-option queries by authenticated user. |
| `apps/console/src/pages/PlaygroundPage.tsx` | Subscribe to retained chat state, scope model/price queries by owner, move selectors into the composer and reorder sidebar content. Distinguish unloaded saved keys from unavailable ones. |
| `apps/console/src/pages/playground.css` | Borderless transcript, 880px chat/250px sidebar maximums, compact composer, responsive selectors and 140px textarea growth limit. |
| `apps/console/src/lib/playground-store.test.ts` | Eighteen persistence, lifecycle, account-isolation and storage regression cases. |
| `apps/site/data/authored-guides.ts`, `docs/playground.md` | Update selection placement, retention, refresh behavior and storage limitations. |
| `docs/playground-refinement-report.md`, `docs/playground-persistence-report.md` | Link historical behavior to this current delivery report. |

## Storage and request behavior

- One conversation per browser tab, stored in `sessionStorage` with its owner ID. No server history, cross-tab synchronization, database change or new dependency.
- Restore messages, draft, selections, aggregate usage and request timings only for the authenticated owner. Restored pending assistant messages become Stopped; restoration never starts inference.
- Save at most once per 250ms while editing/streaming, then flush received text and storage on completion, Stop, visibility changes and document unload. Page navigation only detaches the UI subscription.
- Stop/New chat/account cleanup invalidate the request generation before delayed events can update state. Same-user profile/session refresh does not replace the store. StrictMode cleanup preserves saved state and allows reuse.
- Validate saved IDs, messages, enums, numeric usage and timings. A snapshot over two million characters, malformed data or unavailable/full storage never truncates the in-memory conversation. The UI explains persistence failure and clears that notice after recovery.
- A saved key from a later page remains selected and prompts Load more keys until its option is loaded; it is not silently replaced with another billing key.
- The same visible message history and strict BFF input are used. No hidden prompts, extra request metadata, automatic retries or extra inference requests were introduced. Billing, token accounting, balances and admin model restrictions are unchanged.

No BFF endpoint or public response schema changed in this refinement. Existing metadata serializers and leak tests remain in place.

## Validation

- `npm test`: **308 Vitest tests and 11 site tests passed**; five existing optional PostgreSQL tests skipped.
- `npm run typecheck`: all workspaces passed.
- `npm run check`: passed, including tests, type checks, site lint, provider/content checks, production builds and brand checks.
- The eighteen new regression cases cover background completion without subscribers; exact restoration; interrupted restoration without replay; buffered Unicode on Stop; New chat and delayed events; logout/account changes; stable immutable snapshots; throttled saves; StrictMode-style cleanup/reuse; storage recovery; redaction; malformed enum values; oversized output; and unavailable storage.
- Browser navigation test: a synthetic stream completed while Usage was open. Returning and then refreshing restored the same 11,999-character answer, draft, key and model.
- Browser interruption test: a refresh during a second synthetic stream restored all text received before unload and displayed Stopped. The fixture recorded exactly two inference POSTs for the two deliberate sends, with no replay.
- Signing out and back in restored an empty conversation and draft. Desktop and 390px mobile layouts were inspected in dark/light themes; the mobile document had no horizontal overflow and the composer stayed in view. Temporary viewport settings were reset.
- An existing development tab recorded a transient authentication-context error during hot replacement. The completed page passed a fresh-load check with no warnings or errors; navigation, refresh and sign-out checks also completed successfully.
- Metadata checks passed across 69 captured fixture responses, 38 console assets, 43 public-site client files and all 57 resolved documentation routes. The separate synthetic BFF suite passed 21 route/stream checks. No unintended multiplier/reference-cost fields or injected upstream credential markers were found. The original [metadata occurrence inventory](playground-refinement-report.md#remaining-metadata-occurrences) remains applicable: server adapters/error suppression, negative tests and developer/source-archive documentation only.

All inference verification used isolated synthetic fixtures. No paid inference request or deployment was performed. The normal local development servers remain available for testing.
