# Production deployment

The public site and customer console are one product but have separate runtime targets:

- Build and publish the public site from the repository root with `npm run build:site`.
- Run the console, BFF, and Redis on the VPS with `deploy/compose.yaml`.

The admin analytics dashboard adds an isolated PostgreSQL service. Follow the
[analytics release and backup instructions](../docs/website-analytics.md) and set
`ANALYTICS_DB_PASSWORD` before using the updated Compose configuration.

## 1. Validate the release

Use Node 22.13 or newer and deploy a clean, committed revision.

```sh
npm ci
npm run check
git status --short
```

The final command should be empty before building production containers.

## 2. Create the private environment file

```sh
cp deploy/.env.example deploy/.env
git rev-parse --short=12 HEAD
openssl rand -base64 48
```

Put the commit ID in `PORTAL_IMAGE_TAG` and the generated value in
`SESSION_ENCRYPTION_KEY`. Never commit `deploy/.env`; it is ignored by Git.

Keep `PUBLIC_SITE_ORIGINS` limited to the real HTTPS public domains. The session
cookie is intentionally host-only and SameSite=Lax, so an unrelated preview
domain cannot provide authenticated header or sign-out behavior.

Leave every `ENABLE_*_WRITES` flag set to `false` for the first deployment.
Enable API-key, profile, redemption, and announcement writes individually only
after testing each operation and its rollback path with a disposable account.

## 3. Build and start the console stack

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml build --pull
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d
docker compose --env-file deploy/.env -f deploy/compose.yaml ps
```

Point `console.kineticrouter.com` at the VPS, install
`deploy/caddy/console.kineticrouter.com.caddy` in the active Caddy configuration,
and reload Caddy. Caddy terminates TLS and routes `/portal/*` and `/readyz` to
the BFF; all other console paths go to the web container.

## 4. Verify before enabling writes

```sh
curl --fail http://127.0.0.1:3101/healthz
curl --fail https://console.kineticrouter.com/readyz
curl --fail --head https://console.kineticrouter.com/
```

Confirm sign-in, session refresh, sign-out, read-only dashboard data, and the
public-site account menu. Then enable and test one write gate at a time.

For rollback, check out the previous committed release, restore its immutable
`PORTAL_IMAGE_TAG`, rebuild, and run `docker compose ... up -d` again. Do not
delete the Redis volume during a routine rollback.
