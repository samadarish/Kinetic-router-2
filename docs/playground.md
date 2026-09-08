# Playground setup and local testing

When enabled, the website header includes Playground for everyone. An authenticated user goes to the console playground; a signed-out visitor signs in first and returns there, including after an authenticator challenge. Use the same hostname consistently when testing locally.

## Show or hide Playground

1. Sign in as an active administrator and open **Playground settings** (`/admin/playground`).
2. Turn **Enable Playground** on or off, then choose **Save settings**. The switch starts on for both new installations and existing settings records.
3. Turning it off hides Playground in the website header, console navigation and related shortcuts. Direct console visits return to the dashboard; customer `/portal/v1/playground/*` endpoints reject requests with `403 PLAYGROUND_DISABLED`. This also applies to administrators using the customer Playground.
4. Saved chats, enabled model IDs and identity settings remain intact. Replies already admitted may finish and save; new requests are blocked. Turn the switch back on and save to restore access.

The saving admin sees the navigation change immediately. Other open foreground pages refresh availability every 60 seconds and on focus; a reload fetches it immediately. While availability is unknown or its check fails, Playground links stay hidden. Admin settings, model discovery and chat inspection remain available while the switch is off. Customer billed usage and model pricing also remain available.

## Enable models as an administrator

1. Sign in to the Kinetic console with an active administrator account.
2. Open **Playground settings** in the sidebar, or `/admin/playground`.
3. Choose one of your active API keys as a source. This loads the complete catalog available to that key, including image and review models. It does not enumerate other customers' keys.
4. Select the models customers should be able to test. Switching source keys retains discovered choices. Add an exact, case-sensitive model ID manually when needed; up to 500 IDs can be enabled.
5. Choose **Save settings**. No models are enabled initially. Saving an empty selection disables new Playground sends.
6. Open Playground and choose a key. Its model list contains only enabled models that the key can access. Image or review IDs can be enabled, but the playground itself sends text chat requests; the model must support that protocol.

The settings page only controls Kinetic Playground. It does not alter the public inference API, upstream routing, billing, balances, or key permissions. Existing streams may finish after a model is disabled; new sends are checked against the latest settings.

If another administrator saves first, reload saved settings and reapply your changes. A failed or timed-out save must be reloaded before retrying because its outcome may be uncertain. Reload failures preserve your current selections.

## Set a model's identity

1. In **Playground settings**, expand **Identity** beneath the exact model ID.
2. Optionally enter an **Identity name** (up to 80 characters on one line) and a **Knowledge cutoff** month and year. Either field can be used alone. Both start blank; the console does not guess these values from the model ID.
3. Use verified information for the selected route. These details guide how the model introduces itself; they do not change or establish its underlying model version, training, or actual knowledge.
4. Choose **Save settings**. Search and source-key changes preserve unsaved identity edits. Identity details can be edited while a model is disabled and remain saved when it is enabled again.
5. Open Playground and start a **New chat** to test the identity with a clean history. A saved edit takes effect on the next send; active streams and earlier replies stay unchanged.
6. To remove the instruction, choose **Clear identity** (or empty both fields), then **Save settings**. Removing just one field retains the other. **Reload saved** discards unsaved identity and enablement edits after a successful reload.

For a configured model, the BFF adds one fixed system instruction using its saved name and/or cutoff before the visible conversation. It instructs the model to answer only the identity detail requested and mention its knowledge cutoff only when specifically asked. Administrators cannot enter arbitrary system prompts here. Unconfigured models receive the original conversation without an added instruction. Customer chat requests cannot override these settings, and model catalogs and stream metadata do not expose the stored configuration.

This applies only to requests sent through Kinetic Playground. The exact inference model ID and the public inference API are unchanged. The additional instruction tokens are charged normally under the selected key's existing billing rules and reported usage. The model must support a system instruction; a rejected request is not automatically retried with the instruction removed. Self-identification is model-generated text and is not proof of the underlying model.

## Local development

1. Run `npm install` and copy `.env.example` to `.env` if it does not already exist. Preserve your existing account URL and credentials.
2. Provide a PostgreSQL database through `PLAYGROUND_DATABASE_URL`. An empty value reuses `ANALYTICS_DATABASE_URL`, independently of whether website analytics is enabled. Chat storage has no volatile fallback: an unavailable database blocks sends before inference.
3. For a local PostgreSQL installation, set `PLAYGROUND_PG_BIN` to its binary directory and run `npm run dev:playground-db`. On this Windows checkout the helper can also reuse the existing embedded test binaries. It creates a **separate persistent cluster** at `.cache/pg-playground-dev/data`, bound to `127.0.0.1:55433`. Set `PLAYGROUND_DATABASE_URL=postgresql://playground_dev@127.0.0.1:55433/postgres`. This helper uses local trust authentication for development only; use authenticated PostgreSQL for deployment. It never deletes stored chats.
4. Run `npm run dev`. Open the website at `http://localhost:3000` and console at `http://localhost:5174`. The BFF readiness endpoint is `http://127.0.0.1:3101/readyz`; it checks account connectivity. Open Playground to verify chat database connectivity too.
5. Restart the database after a machine reboot with `npm run dev:playground-db`. Stop it with `node scripts/playground-dev-db.mjs stop`; this preserves the database files. Restart the BFF after changing `.env`.

Development without Redis stores model settings in ignored `.cache/playground-settings.json`, independent of the command's working directory. Settings survive restarts; in-memory login sessions do not. This file store is for a single development BFF process. Production uses the existing Redis service and a non-expiring `kr:portal:settings:playground` record. Conversations use PostgreSQL, with an independent pool of up to four connections. The existing production analytics database can be reused; additive `kr_playground_*` tables and indexes initialize automatically under an advisory lock. The database user needs schema creation privileges for that first initialization. Back up this database alongside your existing application data. No external Sub2API deployment changes are involved.

Older settings records default to an empty identity list and `playgroundEnabled: true` without rewriting them or changing their revision. Deploy the updated BFF before the updated console and website, and update all BFF instances before allowing settings writes. Any settings save by this version persists `modelIdentities` and `playgroundEnabled`; previous strict BFF versions cannot read that expanded record. Do not mix old and new BFF versions after such a save. Before rolling back, stop settings writes and back up the current record, then restore a compatible pre-upgrade settings record. Older versions cannot enforce a disabled global switch. Legacy clients sending only revision and enabled IDs preserve identities and the current global switch; an explicit empty identity array clears identities.

If the account service request fails, check readiness, the configured `SUB2API_BASE_URL`, and outbound connectivity from the BFF process. A restricted terminal may block the upstream connection even when the service works in a browser. Keep `.env` and credentials out of Git and logs.

For a **model service** error, account readiness does not establish inference availability. Match the failed response's `requestId` to the BFF log entry `Playground model request failed`. Its `failure` category distinguishes an HTTP rejection, a network failure, and an unreadable response; `upstreamStatus` preserves the original HTTP status for server-side diagnosis. Raw upstream bodies and credentials are neither logged by this handler nor forwarded to the browser. Check the gateway's existing error records and confirm the enabled model supports streaming `/v1/chat/completions`. A model's presence in `/v1/models` alone does not confirm that support. Failed sends stay in chat history, and **Reload chat** reconciles that history and clears a stale banner after a successful load. It does not send the prompt again.

Local UI use still connects to the configured real account and inference services. A message sent with a real key is billed normally. Automated regression tests use synthetic fixtures and make no paid inference calls.

## Use the conversation

- Choose the API key and model beneath the message input. The left panel contains **New chat**, saved chat history and collapsible **Status & rates**. On narrow screens, **Chats** opens the history and status panel; selecting a chat closes it and keeps the composer visible.
- Expand **Details** below a reply to see its exact input, output and total token counts. Stopped, failed and interrupted replies remain marked even when Details is closed. The admin inspector continues to show token counts inline.
- The browser sends the selected key ID, exact model ID, new message, conversation ID, revision and unique turn ID. The BFF loads context from that customer's saved conversation and adds only the optional identity instruction described above. It adds no examples, reasoning settings, summaries, or UI metadata.
- Enter sends; Shift + Enter inserts a newline. The first response text appears immediately and later text painting is batched. Scrolling up pauses automatic following; **Jump to latest** resumes it.
- Stop saves received partial text. New chat starts another conversation and retains the selected key/model; previous chats remain in history. Changing the key/model changes the next send, without rewriting earlier replies. **Load earlier messages** retrieves older transcript pages.
- Sent messages and replies remain in the account across navigation, sign-out, server restarts and devices. Unsent drafts stay in the current browser tab and clear on sign-out. Replies continue while switching chats or visiting another console page. A full refresh, closing the tab or Stop cancels the connection; nothing is automatically resent. A restored key from a later options page may require **Load more keys**.
- **Delete** hides a conversation from your chat list. Only submitted prompts and model replies are saved; draft typing is never sent to the server.
- At most one reply runs per browser tab and per conversation. Another tab can view an active conversation, but cannot start a second turn in it. Conflicting or uncertain sends require reloading the conversation; no automatic billable retry occurs.
- Long conversations retain all saved text. Each request includes the latest contiguous turns fitting 40 messages and 128 KiB, including the current prompt and optional identity instruction. A partial reply can remain in this recent context. An omission note appears when earlier turns are excluded. Stored transcripts and reported token usage are never truncated or recalculated to match this request window.
- A prior tab-only chat is offered for optional import. Its text and model labels are saved with imported provenance; browser-supplied usage/timing metrics are not treated as authoritative.
- Model status distinguishes key access, current request activity, and separately reported channel monitoring. Missing or ambiguous monitoring data is shown as unavailable, without health probes or invented uptime claims.
- **View rates** fetches final customer prices on demand when supported; **Billed usage** opens actual charged costs. Stopping or retrying can still incur usage, and billable sends are never retried automatically.

## Verify a change

For PostgreSQL integration tests, point `PLAYGROUND_TEST_DATABASE_URL` at a development database and run `npx vitest run test/playground-history.test.ts`. Tests create and remove uniquely named `playground_test_*` schemas; they do not erase application tables. On PowerShell: `$env:PLAYGROUND_TEST_DATABASE_URL='postgresql://playground_dev@127.0.0.1:55433/postgres'`. The default test suite uses an injected memory fixture, and a separate test verifies that an unconfigured production store fails closed.

Run `npm test`, `npm run typecheck`, and `npm run check`. The tests cover default-empty policy, admin authorization and fresh write verification, conflicting saves, persistence, ownership, credential rotation, clean requests and streamed responses, key-option redaction, buffering, Markdown safety, header destinations, navigation/refresh persistence, owner isolation and stale stream callbacks. Identity tests cover old records and clients, explicit clearing, atomic saves, validation, exact outbound instructions, unchanged unconfigured requests, latest settings on each send, and admin draft handling. Redis command behavior is tested with a mock; this does not replace integration testing against Redis during deployment.

For browser review, check desktop/mobile layouts and both themes. Inspect `/portal/v1/*` responses: no internal multiplier aliases or upstream access/refresh tokens should appear. Key management intentionally supports revealing a customer's own API key; Playground key options contain only IDs and names. Usage retains actual billed cost.

## Upgrade and recovery

Update all BFF instances before serving the updated console. The saved-chat endpoint rejects the previous browser-supplied `messages` format with `PLAYGROUND_UPDATE_REQUIRED`, so old console tabs must refresh. If rolling back, preserve the new tables and backups; older code cannot display these saved conversations. Normal completion is acknowledged only after its final snapshot is saved. Streaming checkpoints run at most once per second when changed; idle leases renew every 15 seconds. A hard crash can lose text received after the last checkpoint. A stale 150-second lease marks an abandoned turn stopped on its next read or send, without contacting inference again.
