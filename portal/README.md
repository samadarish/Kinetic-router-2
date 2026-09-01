# kineticRouter Customer Portal

An isolated customer console for the existing kineticRouter Sub2API deployment. Existing users authenticate with the same Sub2API email and password. The portal does not access Sub2API PostgreSQL or Redis and is never part of the inference request path.

## What is implemented

- Real password login, optional TOTP challenge, encrypted server-managed sessions, refresh rotation, logout, CSRF protection, and origin validation.
- kineticRouter dashboard greeting, service readiness, seven account KPIs, and copyable OpenAI/Anthropic/Grok integration examples.
- API-key listing and stock Sub2API options for create/edit/status/delete, guarded by a deployment feature flag.
- Usage analytics, model breakdowns, filters, paginated events, latency/token/cost fields, charting, and spreadsheet-safe CSV export.
- Channel monitor, subscriptions, redemption history/submission, profile updates, and password changes.
- kineticRouter blue/cyan branding with a compact provider-console interface and dark mode by default.

## Local development

Copy `.env.example` to `.env` only when overriding defaults. The local BFF uses an in-memory session store; production refuses to start without Redis.

```powershell
npm install
npm run build -w @kineticrouter/portal-contract
npm run build -w @kineticrouter/sub2api-client
npm run dev
```

Open `http://localhost:5174`. The Vite development server binds that exact port and proxies `/portal/*` to the BFF on `127.0.0.1:3101`. Use `localhost` consistently for the public site and console during local development so their host-scoped session cookie is shared.

## Feature gates

Writes are deliberately disabled by default:

```text
ENABLE_KEY_WRITES=false
ENABLE_PROFILE_WRITES=false
ENABLE_REDEEM_WRITES=false
```

Enable a flag only after its contract tests and a disposable-account smoke test pass. Read requests may retry once after token refresh; writes are never automatically replayed.

## Production layout

`deploy/compose.yaml` creates only `customer-portal` services: a static web container, Node BFF, and dedicated Redis. It binds loopback ports `3100` and `3101` for the new Caddy virtual host. It does not join, restart, recreate, or modify the existing `sub2api` Compose project.

Before production activation:

1. Create `deploy/.env` from `deploy/.env.example` with a random session-encryption key and an immutable release/commit image tag; retain the previous tag for rollback.
2. Build and start the separate Compose project.
3. Confirm both container health checks, then run the read-only smoke script with `PORTAL_SMOKE_URL=https://console.kineticrouter.com`, `PORTAL_SMOKE_ORIGIN=https://console.kineticrouter.com`, `PORTAL_SMOKE_PUBLIC_SITE_ORIGIN=https://kineticrouter.com`, and dedicated test-account credentials supplied through environment variables.
4. Copy the new Caddy site file, validate the complete Caddy configuration, and gracefully reload Caddy.
5. Confirm inference requests to `https://api.kineticrouter.com/v1` remain healthy and unchanged.

Rollback removes the console Caddy route and stops only the `customer-portal` Compose project. The existing Sub2API gateway and admin UI continue operating.

Native Anthropic/Grok route controls are intentionally not exposed by this customer portal. See [`docs/native-route-admin-prerequisites.md`](docs/native-route-admin-prerequisites.md) for the administrator contract required before implementing those toggles.

## Secrets

Never commit `.env`, test credentials, VPS credentials, access/refresh tokens, complete API keys, or generated session secrets. Authenticated responses use `Cache-Control: no-store`; raw API keys are retained only in browser memory to preserve the installed Sub2API copy behavior.
