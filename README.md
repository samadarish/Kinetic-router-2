# kineticRouter

One repository and one npm workspace for the complete kineticRouter product.

## Applications

- `apps/site` — public website and documentation at `kineticrouter.com`.
- `apps/console` — authenticated customer console at `console.kineticrouter.com`.
- `apps/bff` — same-origin console backend under `/portal/*`.
- `api.kineticrouter.com` remains the existing external Sub2API deployment and inference gateway.

Shared product configuration, provider metadata, branding, contracts, and the Sub2API client live under `packages/`. The public site and console are independently deployable, but they are maintained and versioned as one product.

## Local development

Use Node 22.13 or newer. Copy `.env.example` to `.env` only when overriding the safe development defaults.

```powershell
npm install
npm run dev
```

- Public site: `http://localhost:3000`
- Console: `http://localhost:5174`
- BFF: `http://127.0.0.1:3101`

Use `localhost` consistently in the browser so the local host-scoped session works across the public account menu and console.

Focused commands are available as `npm run dev:site`, `npm run dev:console`, `npm run build:site`, `npm run build:console`, and `npm run build:bff`.

## Validation

```powershell
npm test
npm run typecheck
npm run check
```

The checks cover both applications, shared provider/origin/route contracts, BFF security, documentation integrity, branding, and production builds.

## Authentication and security boundary

Existing Sub2API users sign in with the same credentials. The BFF owns encrypted server sessions and never exposes upstream tokens to the browser. Production uses the host-only `__Host-kr_session` cookie with Secure, HttpOnly, SameSite=Lax, Path `/`, and no Domain attribute.

Only the public-session and logout endpoints accept credentialed requests from explicitly configured public-site origins. All other account APIs remain same-origin on the console domain.

## Deployment

- The public site uses the existing Sites project configured by `.openai/hosting.json`; `npm run build:site` stages its deployable artifact at root `dist/`.
- The console, BFF, and Redis use `deploy/compose.yaml` and the console Caddy route.
- The existing Sub2API Compose project, database, admin UI, and inference route are not modified.

Follow the [production runbook](deploy/README.md) for environment setup, immutable image tags, TLS routing, health checks, rollback, and write-gate activation.

Production write operations remain disabled by default through the `ENABLE_*_WRITES` flags. Enable a write only after disposable-account contract and rollback testing.

Never commit environment files, test credentials, VPS credentials, tokens, API keys, session secrets, dependencies, or generated build output.
