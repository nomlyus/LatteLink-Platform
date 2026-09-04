# Two-Environment Deployment Model

LatteLink uses two deployed environments:

- `dev`: the shared full-stack integration environment
- `production`: the live pilot environment

There is no separate deployed staging stack. "Staging" is a release-candidate state inside `dev`.

## Branch and release flow

- Push to `feature/*`, then merge into `develop`
- `develop` passes the full `ci` workflow and auto-deploys to `dev`
- Validate the release candidate in `dev`
- Fast-forward the exact passing commit to `main`
- Publish a GitHub Release with notes for that exact commit
- The release event deploys the tagged source to `production`

The Git SHA that passes in `dev` must be the same SHA tagged and released from
`main`.

## GitHub Actions workflows

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-dev.yml`
- `.github/workflows/deploy-prod.yml`
- `.github/workflows/publish-images.yml` is retained as a manual portability
  path and is not part of routine Heroku deployment.

## GitHub Environments

Create two GitHub Environments in the repository:

- `dev`
- `production`

Each environment needs its own vars and secrets.

## Required environment vars

These should be configured as GitHub Environment vars unless they are sensitive:

- `API_DOMAIN`
- `CLIENT_DASHBOARD_DOMAIN`
- `HEROKU_APP_NAME`
- `DEPLOY_ENABLED`
- `PASSKEY_RP_ID`
- `CORS_ALLOWED_ORIGINS`
- `ALLOW_DEV_CUSTOMER_LOGIN`
- `PAYMENTS_PROVIDER_MODE`
- `CLOVER_OAUTH_ENVIRONMENT`
- `APPLE_SIGN_IN_ENABLED`
- `APPLE_ALLOWED_CLIENT_IDS`
- `GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS`
- `WEBAPP_MENU_SOURCE_URL`
- `MENU_SYNC_LOCATION_ID`
- `MENU_SYNC_INTERVAL_MS`
- `MENU_SYNC_MAX_RETRIES`
- `MENU_SYNC_RETRY_DELAY_MS`
- `CATALOG_MEDIA_R2_ACCOUNT_ID`
- `CATALOG_MEDIA_R2_BUCKET`
- `CATALOG_MEDIA_PUBLIC_BASE_URL`
- `CATALOG_MEDIA_UPLOAD_MAX_BYTES`
- `CATALOG_MEDIA_UPLOAD_EXPIRY_SECONDS`

Recommended values:

- `dev`
  - `API_DOMAIN=api-dev.nomly.us`
  - `CLIENT_DASHBOARD_DOMAIN=app-dev.nomly.us`
  - `HEROKU_APP_NAME=<development Heroku app>`
  - `DEPLOY_ENABLED=false` until the Heroku app and config are ready
  - `APPLE_SIGN_IN_ENABLED=true`
  - `APPLE_ALLOWED_CLIENT_IDS=com.lattelink.rawaq.beta,com.lattelink.rawaq`
  - `PAYMENTS_PROVIDER_MODE=simulated`
  - `ALLOW_DEV_CUSTOMER_LOGIN=true`

- `production`
  - `API_DOMAIN=api.nomly.us`
  - `CLIENT_DASHBOARD_DOMAIN=app.nomly.us`
  - `HEROKU_APP_NAME=<production Heroku app>`
  - `DEPLOY_ENABLED=false` until the Heroku app and config are ready
  - `APPLE_SIGN_IN_ENABLED=true`
  - `APPLE_ALLOWED_CLIENT_IDS=com.lattelink.rawaq.beta,com.lattelink.rawaq`
  - `PAYMENTS_PROVIDER_MODE=live`
  - `ALLOW_DEV_CUSTOMER_LOGIN=false`

## Required environment secrets

- `HEROKU_API_KEY`
- `DATABASE_URL`
- `GATEWAY_INTERNAL_API_TOKEN`
- `ORDERS_INTERNAL_API_TOKEN`
- `LOYALTY_INTERNAL_API_TOKEN`
- `NOTIFICATIONS_INTERNAL_API_TOKEN`
- `JWT_SECRET`
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY`

Optional database operations secret:

- `BACKUP_DATABASE_URL` — direct Supabase connection string used by restore drills; falls back to `DATABASE_URL` if unset

Optional secrets depending on enabled features:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_STATE_SECRET`
- `CLOVER_APP_ID`
- `CLOVER_APP_SECRET`
- `CLOVER_OAUTH_REDIRECT_URI`
- `CLOVER_OAUTH_STATE_SECRET`
- `CLOVER_WEBHOOK_SHARED_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_CONNECT_WEBHOOK_SECRET`
- `CATALOG_MEDIA_R2_ACCESS_KEY_ID`
- `CATALOG_MEDIA_R2_SECRET_ACCESS_KEY`

Menu-image uploads require a real Cloudflare R2 bucket in each environment. See [menu-image-upload-r2.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/menu-image-upload-r2.md) for bucket CORS, public URL, and end-to-end validation.

## App environment mapping

Mobile:

- `beta` -> `dev`
- `production` -> `production`

Dashboard:

- local dashboard development should point to `dev`
- deployed dashboard should have separate `dev` and `production` builds/domains

## Heroku layout

- `dev` uses one Eco web dyno and may sleep after inactivity.
- `production` uses one always-on Basic web dyno.
- Each environment is a separate Heroku app with separate config vars.
- Heroku terminates TLS and routes public traffic directly to the gateway.
- The gateway and domain services listen on separate loopback ports inside one
  Node process. Workers that need the same operational data run in that process.
- Valkey is intentionally omitted while each environment runs one web dyno.
  Polling and in-memory rate limits are sufficient for this pilot topology.
- Before scaling to multiple web dynos, add managed Redis/Valkey and separate
  background workers so event delivery and distributed rate limits remain
  consistent.

Never share the same database or payment credentials between `dev` and
`production`.

## Database policy

- `production` must point at the production Supabase database via `DATABASE_URL`
- `dev` must point at a separate dev Supabase database via `DATABASE_URL`
- deployed environments must not synthesize a bundled Droplet Postgres URL
- Heroku uses the external Supabase shared pooler in session mode on port `5432`
  because Heroku's Common Runtime is IPv4 and Supabase direct endpoints are IPv6
  unless the project has the IPv4 add-on
- the bundled `postgres` service in [`infra/free/docker-compose.yml`](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/infra/free/docker-compose.yml) remains local-only

Backup and restore operations are covered in [`database-backup-restore.md`](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/database-backup-restore.md).

## Postgres Pool Budget

The deployed stack uses external Supabase Postgres through `DATABASE_URL`; the Compose `postgres` service is not part of dev or production. Pool sizing is configured per process so production can scale write-heavy services without exhausting the Supabase connection budget.

Dev remains conservative:

| Process                     | Pool max |
| --------------------------- | -------: |
| identity                    |        2 |
| orders                      |        2 |
| catalog                     |        2 |
| payments                    |        2 |
| loyalty                     |        2 |
| notifications               |        2 |
| worker-payment-reconciler   |        1 |
| **Total app-side capacity** |   **13** |

Production starts with this explicit budget:

| Process                     | Pool max |
| --------------------------- | -------: |
| identity                    |        5 |
| orders                      |        6 |
| catalog                     |        4 |
| payments                    |        5 |
| loyalty                     |        3 |
| notifications               |        3 |
| worker-payment-reconciler   |        1 |
| **Total app-side capacity** |   **27** |

The current production gate assumes the Supabase pooler limit is at least `60` connections and keeps at least `20` connections of headroom for migrations, backups, Supabase/admin tooling, and emergency sessions. Confirm the actual project pooler limit in the Supabase dashboard before raising any `*_POSTGRES_POOL_MAX` value.

Deploy scripts write and validate:

- `POSTGRES_POOL_BUDGET_LIMIT`
- `POSTGRES_POOL_HEADROOM_MIN`
- `IDENTITY_POSTGRES_POOL_MAX`
- `ORDERS_POSTGRES_POOL_MAX`
- `CATALOG_POSTGRES_POOL_MAX`
- `PAYMENTS_POSTGRES_POOL_MAX`
- `LOYALTY_POSTGRES_POOL_MAX`
- `NOTIFICATIONS_POSTGRES_POOL_MAX`
- `PAYMENT_RECONCILER_POSTGRES_POOL_MAX`

Run `infra/free/bin/check-postgres-pool-budget.sh infra/free/.env.example` locally, or review the deploy log line `[check-postgres-pool-budget] total app-side pool capacity=...`, before promoting a production pool change. Service `/ready` responses include non-secret persistence metadata with the effective `database.pool.max`.

## Deploy Sequencing

1. The workflow validates the environment and confirms `DATABASE_URL` contains
   the expected Supabase project reference.
2. `scripts/heroku-sync-config.mjs` updates only changed, allowlisted Heroku
   config vars and never prints values.
3. Heroku builds `infra/heroku/Dockerfile` through `heroku.yml`.
4. Heroku runs `node dist/migrate.js` in the release phase. A failed migration
   blocks the release.
5. The web process starts the loopback services, then the public gateway, then
   the embedded workers.
6. GitHub waits for `/health`, runs `infra/free/bin/smoke-check.sh`, and, in
   development, runs the deployed checkout E2E.

See [`heroku-backend-deployment.md`](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/heroku-backend-deployment.md)
for provisioning, domain, rollback, and scaling procedures.
