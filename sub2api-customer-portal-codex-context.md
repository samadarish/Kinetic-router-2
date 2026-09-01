# Sub2API Customer Portal — Codex Context and Planning Brief

## 1. Project objective

Build a new, modern customer-facing portal for an already deployed Sub2API installation.

The new portal should let normal users perform the same user-level actions that are currently available in the Sub2API frontend, such as:

- Sign in and sign out
- Register, when registration is enabled
- View and update their profile
- View account balance, quota, subscription, or plan information
- View available models and user-visible pricing information
- View usage summaries and paginated usage details
- List, create, edit, disable, and delete their API keys
- Configure user-level API-key options supported by the installed Sub2API version
- Use redemption, billing, payment, or subscription flows when those features are enabled

The original Sub2API admin panel must remain available for administrative work.

The new portal is a separate customer UI, not a replacement for the Sub2API backend.

---

## 2. Current situation

- Sub2API is already deployed and working on a VPS.
- Existing API clients are already using the Sub2API inference/API endpoint.
- Stability is more important than changing the existing deployment quickly.
- The existing Sub2API frontend is not considered good enough for customers.
- The owner wants a custom UI that can evolve independently.
- Administrative settings should continue to be managed through the original Sub2API admin interface.
- User actions in the custom portal must update the same underlying Sub2API data.
- The portal should be deployable without taking Sub2API offline.
- The new portal must not become part of the inference request path.

---

## 3. Core architecture decision

### Sub2API remains the source of truth

Use the existing Sub2API backend APIs for all Sub2API-owned data and actions.

Do not connect the browser or custom portal directly to the Sub2API database.

Do not insert, update, or delete Sub2API records with direct SQL.

Reasons:

1. Direct database access would tightly couple the portal to Sub2API's internal schema.
2. A Sub2API update could rename tables, columns, relationships, or constraints.
3. Direct writes could bypass validation, authorization, defaults, cache invalidation, audit behavior, quota rules, and other backend logic.
4. Using the supported API keeps the original frontend, custom portal, and backend consistent.

### Recommended request flow

```text
Customer browser
        |
        v
Custom portal at console.example.com
        |
        v
Thin portal adapter / BFF
        |
        v
Existing Sub2API user API
        |
        v
Existing Sub2API database and Redis
```

### Inference traffic must remain unchanged

```text
Customer application
        |
        v
Existing API endpoint at api.example.com
        |
        v
Sub2API gateway
        |
        v
Upstream model provider
```

Never route LLM traffic through the new customer portal or its adapter.

---

## 4. Separation of responsibilities

### Custom customer portal

The portal should expose only normal user capabilities:

- Authentication and session UX
- User dashboard
- API-key management
- Usage and spend views
- Balance, quota, plan, and subscription views
- Model catalogue visible to the authenticated user
- Billing, checkout, redemption, or order flows supported by Sub2API
- Profile and account settings
- Documentation links and onboarding
- Optional API playground, provided it calls the normal public API endpoint directly and safely

### Original Sub2API admin interface

Keep these functions in the existing admin panel:

- Upstream/provider account management
- Proxies
- Groups
- User administration
- Pricing and rate configuration
- Payment-provider configuration
- System settings
- Registration policy
- Operational monitoring
- Administrative logs and statistics
- Any endpoint requiring administrator privileges

Do not expose administrator credentials or administrator APIs to the customer portal.

---

## 5. Compatibility layer recommendation

Place a thin backend-for-frontend, or BFF, between the browser and Sub2API.

Example public portal API:

```text
POST   /portal/auth/login
POST   /portal/auth/logout
POST   /portal/auth/refresh
GET    /portal/me
PATCH  /portal/me
GET    /portal/api-keys
POST   /portal/api-keys
PATCH  /portal/api-keys/:id
DELETE /portal/api-keys/:id
GET    /portal/usage/summary
GET    /portal/usage/events
GET    /portal/models
GET    /portal/billing
GET    /portal/subscriptions
```

The exact routes above are the portal's stable contract. The adapter translates them to the actual endpoints exposed by the installed Sub2API version.

Important:

- Do not assume endpoint paths from memory or an online version.
- Inspect the exact Sub2API source/version running on the VPS.
- Use the existing Sub2API frontend API clients and backend route definitions as the primary API-contract reference.
- Record every discovered endpoint, method, request body, response shape, authentication requirement, and error format.
- Keep all Sub2API-specific translation inside one adapter/client package.

Suggested internal structure:

```text
apps/
  portal-web/
  portal-bff/

packages/
  sub2api-client/
  portal-types/
  ui/
```

Example `sub2api-client` modules:

```text
auth
profile
keys
usage
models
balance
subscriptions
payments
redemption
```

The frontend should depend on the portal contract, not on raw Sub2API response formats.

---

## 6. Technology preference

A lightweight implementation is preferred.

Recommended baseline:

### Frontend

- React with Vite, or Next.js only when server-side features are truly needed
- TypeScript
- Tailwind CSS
- shadcn/ui or another accessible component system
- TanStack Query for server state
- A small charting library for aggregated usage data
- Static assets served by Nginx when possible

### Adapter/BFF

One of:

- Hono
- Fastify
- Express with a minimal dependency set
- Next.js route handlers only if Next.js is already selected

The BFF should be small and stateless unless server-side sessions are chosen.

### Database

Do not add a new database in the first version.

A separate portal database may be introduced later only for portal-owned features such as:

- Teams
- Projects
- UI preferences
- Alerts
- Saved prompts
- Support data
- Custom onboarding state

Never duplicate Sub2API balances, keys, subscriptions, or usage as an independent source of truth.

---

## 7. Authentication and security requirements

Codex must inspect how the installed Sub2API version authenticates its current frontend before choosing a session strategy.

Preferred principles:

- Keep access tokens out of localStorage when a secure HTTP-only cookie architecture is practical.
- If the Sub2API API requires bearer tokens, let the BFF store or relay them using secure server-managed sessions where feasible.
- Use `Secure`, `HttpOnly`, and appropriate `SameSite` cookie attributes.
- Protect state-changing routes against CSRF when cookie authentication is used.
- Never place administrator tokens in the customer frontend.
- Never log passwords, complete API keys, access tokens, refresh tokens, payment secrets, or sensitive provider responses.
- Mask API keys after initial creation.
- Confirm whether Sub2API returns the complete key only once.
- Apply per-user authorization using the authenticated Sub2API identity.
- Do not accept a user ID from the browser as proof of identity.
- Add request timeouts and safe retry rules. Never automatically retry non-idempotent writes unless an idempotency strategy exists.
- Validate all portal request bodies.
- Preserve Sub2API error meaning while returning a stable, sanitized portal error format.
- Restrict CORS to the intended portal origin when direct cross-origin access is unavoidable.
- Prefer same-origin browser-to-BFF calls to avoid unnecessary CORS complexity.
- Add security headers at the reverse proxy and application layers.
- Ensure payment redirects and webhooks continue to use the existing supported Sub2API flow unless explicitly redesigned later.

---

## 8. Performance and resource constraints

The new portal will consume some resources, but it should be lightweight and must not materially affect the existing inference gateway.

Design rules:

- Serve the frontend as static files when possible.
- Keep the BFF small and stateless.
- Do not poll every dashboard endpoint continuously.
- Cache safe read-only data for short periods when appropriate.
- Deduplicate concurrent frontend requests.
- Paginate detailed usage and log views.
- Prefer aggregated usage endpoints over repeatedly downloading raw events.
- Lazy-load charts and heavy pages.
- Add explicit upstream request timeouts.
- Limit response sizes.
- Apply conservative Docker CPU and memory limits after measuring the VPS.
- Do not colocate CPU-heavy build work with production processes; build in CI or in a separate build stage.
- Do not proxy inference endpoints through the portal.
- Do not run background analytics jobs in the first release.

Initial resource targets should be treated as provisional and measured on the actual VPS. A static frontend plus a small adapter should normally be modest, but no resource guarantee should be made until the current VPS capacity and Sub2API load are measured.

---

## 9. Safe deployment model

Keep the existing deployment untouched initially.

Example:

```text
/opt/sub2api/
  existing compose files
  existing configuration

/opt/customer-portal/
  compose.yaml
  .env
  deployment files
```

Use a separate Docker Compose project name:

```bash
docker compose -p customer-portal up -d
```

Do not run `docker compose down` inside the existing Sub2API project.

Suggested hostnames:

```text
api.example.com       -> existing Sub2API API/gateway
admin.example.com     -> existing Sub2API frontend/admin interface
console.example.com   -> new customer portal
```

Bind the new service to an unused loopback port first, for example:

```text
127.0.0.1:3100
```

Then add a new Nginx or Caddy virtual host for `console.example.com`.

Before reloading Nginx:

```bash
nginx -t
systemctl reload nginx
```

Do not restart Sub2API merely to deploy the portal.

The portal must have:

- Its own container/service names
- Its own environment file
- Its own health check
- Its own logs
- Its own resource limits
- A restart policy
- A simple rollback procedure
- No direct dependency that restarts the Sub2API containers

If the portal is stopped or fails, existing API keys and inference traffic must continue to work.

---

## 10. Rollout phases

### Phase 0 — discovery only

Do not modify production.

Tasks:

1. Identify the exact deployed Sub2API version or commit.
2. Inspect its compose/systemd configuration.
3. Inspect current Nginx or Caddy routing.
4. Record VPS CPU, RAM, disk, and current process/container usage.
5. Inventory the installed Sub2API user-facing API.
6. Identify its authentication/session mechanism.
7. Identify whether an OpenAPI document exists.
8. Identify how the existing frontend handles API errors and token refresh.
9. Identify all user-level features enabled in this installation.
10. Produce a risk assessment and implementation plan.

### Phase 1 — local API client and contract tests

Build the `sub2api-client` against a non-production or safely scoped account.

Required tests:

- Login
- Refresh/session continuation
- Logout
- Get current user/profile
- List API keys
- Create an API key
- Edit an API key
- Disable and enable an API key
- Delete a disposable API key
- Read balance/quota
- Read available models
- Read usage summary
- Read paginated usage details
- Read plans/subscriptions
- Read payment or redemption configuration when enabled

Use a dedicated test user and disposable test key.

### Phase 2 — read-only portal

Enable:

- Login
- Dashboard
- Profile
- Balance/quota
- Models
- API-key listing
- Usage
- Subscription/plan display

Do not enable writes yet.

### Phase 3 — controlled user writes

Enable:

- Create API key
- Edit API key
- Enable/disable API key
- Delete API key
- Profile updates

Add audit-friendly logs that contain action metadata but no secrets.

### Phase 4 — billing and additional workflows

Enable only after the corresponding Sub2API flows have been mapped and tested:

- Redemption
- Checkout
- Orders
- Subscription changes
- Cancellations
- Payment return handling

### Phase 5 — optional portal-owned features

Only after the core portal is stable:

- Teams
- Projects
- Usage alerts
- Developer onboarding
- Documentation
- API playground
- Support integration
- Organization views

---

## 11. User interface scope

Suggested navigation:

```text
Overview
API Keys
Usage
Models
Billing
Documentation
Account
```

Dashboard examples:

- Current balance
- Current plan
- Spend in the selected period
- Request count
- Token count when available
- Success/error rate when available
- Active API-key count
- Recent usage
- Usage chart
- Notices from the service owner

API-key page:

- Key name
- Masked key
- Status
- Group or model access when exposed to users
- Quota
- Expiration
- Rate limits
- IP restrictions
- Created date
- Last-used date when available
- Create, edit, enable/disable, and delete actions

Do not invent controls for capabilities that the installed Sub2API version does not expose to normal users.

---

## 12. API inventory deliverable

Codex should produce a table like this after inspecting the actual repository/version:

| Portal capability | Sub2API method/path | Auth | Request | Response | Existing frontend reference | Notes |
|---|---|---|---|---|---|---|
| Login | To be discovered | Public | To be discovered | To be discovered | File and line | Token/session behavior |
| Current user | To be discovered | User | None | To be discovered | File and line | |
| List keys | To be discovered | User | Query params | To be discovered | File and line | Pagination? |
| Create key | To be discovered | User | To be discovered | To be discovered | File and line | Secret shown once? |
| Usage summary | To be discovered | User | Date range | To be discovered | File and line | Aggregated? |

Do not proceed with implementation until this inventory covers all features planned for the first release.

---

## 13. Upgrade-safety strategy

The portal must tolerate Sub2API upgrades as much as practical.

Required measures:

- Pin and record the currently supported Sub2API version.
- Keep raw Sub2API types inside `sub2api-client`.
- Convert raw responses into stable portal domain types.
- Add contract/integration tests for all used endpoints.
- Run tests against a staging Sub2API instance before upgrading production.
- Treat undocumented API behavior as unstable.
- Fail gracefully when optional fields or optional features are absent.
- Add an internal compatibility/version endpoint or startup check when practical.
- Keep a compatibility matrix in the repository.
- Do not upgrade Sub2API and the portal simultaneously without staging validation.
- Keep the original Sub2API frontend available as an operational fallback.

---

## 14. Observability and operations

Minimum requirements:

- Portal health endpoint
- BFF readiness endpoint that checks basic configuration without exposing secrets
- Structured logs
- Request IDs
- Upstream latency measurements
- Error counts by endpoint category
- No sensitive token or key logging
- Docker health check
- Log rotation
- Reverse-proxy access and error logs
- A documented rollback command
- A smoke-test script for login, profile, key listing, and usage

Avoid high-cardinality metrics containing user IDs, complete paths with secrets, or API keys.

---

## 15. Out of scope for the first release

- Replacing the Sub2API backend
- Forking or modifying the production Sub2API backend
- Direct database access
- Direct database writes
- Reimplementing Sub2API authorization or quota logic
- Routing inference traffic through the portal
- Replacing the original admin panel
- Building a second billing source of truth
- Migrating existing API keys
- Changing current customer API endpoints
- Changing existing provider configuration
- Large infrastructure refactoring
- Kubernetes unless already used
- A mobile application
- Heavy analytics pipelines

---

## 16. Information Codex must discover locally

The following details were not provided and must be inspected rather than guessed:

- Exact Sub2API repository, fork, version, tag, or commit
- Whether the deployment uses Docker Compose, systemd, or another method
- Existing container names and ports
- Current reverse proxy
- Current public hostnames
- Database type and deployment location
- Redis configuration
- Authentication and refresh-token design
- Exact normal-user API endpoints
- Exact response schemas
- Enabled payment/subscription systems
- Current VPS CPU, RAM, disk, and headroom
- Current request load
- Whether a staging environment exists
- Whether the custom portal will be in the same repository or a separate repository
- Preferred visual design and branding

Secrets must not be copied into planning documents or committed to source control.

---

# Ready-to-paste initial prompt for local Codex

You are planning a new customer-facing portal for an existing, production Sub2API deployment on a VPS.

Read this entire brief before acting.

The critical constraints are:

1. Do not disrupt or restart the working Sub2API deployment.
2. Do not modify production in the first pass.
3. Do not connect directly to the Sub2API database.
4. Use Sub2API's supported normal-user APIs as the source of truth.
5. Keep the original Sub2API admin UI for administration.
6. The new portal is for normal users only.
7. All API-key, profile, balance, usage, subscription, and billing actions must go through Sub2API's backend logic.
8. Do not route inference/LLM traffic through the portal.
9. Deploy the portal as a separate service/container/project and subdomain.
10. Add a thin compatibility adapter so the frontend does not depend directly on raw Sub2API response schemas.
11. Begin with a read-only portal, then enable writes after contract tests pass.
12. Resource usage must be kept low and isolated from Sub2API.

Your first task is discovery and planning only. Do not change files or production services yet.

Inspect the local repository and any deployment configuration I provide, then produce:

- The exact deployed Sub2API version or best method to identify it
- A diagram of the current deployment
- An inventory of all normal-user API endpoints used by the existing frontend
- Authentication and token-refresh behavior
- A feature map for the proposed portal
- A recommended architecture and repository structure
- A stable portal API contract
- Security risks and mitigations
- Performance and resource risks
- A zero-downtime deployment plan
- A rollback plan
- A phased implementation plan
- A test plan and compatibility test matrix
- A list of only the genuinely missing inputs that cannot be discovered from the repository or server configuration

For every discovered Sub2API endpoint, cite the source file and line range. Do not rely on guessed endpoint names. Clearly separate verified facts from recommendations.

Prefer a lightweight TypeScript implementation. The likely baseline is a Vite/React frontend with a small Hono or Fastify adapter, but recommend a different stack when the repository or deployment evidence justifies it.

Do not expose or print secrets. Redact credentials from command output and examples.

After presenting the plan, stop and wait for approval before implementation.

---

## 17. Suggested first commands for Codex

These are examples only. Adapt them to the actual server and repository.

```bash
# Repository identity
git remote -v
git status
git branch --show-current
git rev-parse HEAD
git describe --tags --always --dirty

# Deployment inventory
docker compose ls
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'
systemctl --type=service --state=running
ss -lntp

# Capacity
free -h
df -h
uptime
docker stats --no-stream

# Search for API clients and routes
find . -maxdepth 4 -type f | sort
rg -n "login|refresh|logout|/keys|api.?key|usage|subscription|payment|redeem|profile" .
rg -n "router|route|GET|POST|PATCH|PUT|DELETE" backend frontend .
```

Do not run destructive commands. Do not restart, stop, recreate, or update containers during discovery.

---

## 18. Definition of success

The project succeeds when:

- Customers use the new portal without needing the original frontend.
- Administrators continue using the original Sub2API admin interface.
- API keys created or changed in the portal are immediately reflected in Sub2API.
- Existing API clients and inference endpoints remain unchanged.
- Stopping or deploying the portal does not stop Sub2API.
- The portal uses no direct Sub2API database writes.
- A Sub2API upgrade can be validated in staging through automated compatibility tests.
- The portal remains lightweight enough that it does not materially degrade API service.
- The original frontend remains available as a fallback.
