# Two-Environment Deployment Model

LatteLink uses two deployed environments:

- `dev`: the shared full-stack integration environment
- `production`: the live pilot environment

There is no separate deployed staging stack. "Staging" is a release-candidate state inside `dev`.

## Branch and release flow

- Push to `feature/*`, then merge into `develop`
- `develop` publishes images and auto-deploys to `dev`
- Validate the release candidate in `dev`
- Promote the exact passing image SHA to `production`

The image SHA that passes in `dev` should be the same SHA promoted to `production`.

## GitHub Actions workflows

- `.github/workflows/publish-images.yml`
- `.github/workflows/deploy-dev.yml`
- `.github/workflows/deploy-prod.yml`

## GitHub Environments

Create two GitHub Environments in the repository:

- `dev`
- `production`

Each environment needs its own vars and secrets.

## Required environment vars

These should be configured as GitHub Environment vars unless they are sensitive:

- `API_DOMAIN`
- `CLIENT_DASHBOARD_DOMAIN`
- `DEPLOY_PATH`
- `IMAGE_REGISTRY_PREFIX`
- `DEPLOY_ENABLED`
- `PASSKEY_RP_ID`
- `COMPOSE_PROJECT_NAME`
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
  - `COMPOSE_PROJECT_NAME=lattelink-dev`
  - `DEPLOY_ENABLED=false` until the dev droplet is provisioned and reachable
  - `APPLE_SIGN_IN_ENABLED=true`
  - `APPLE_ALLOWED_CLIENT_IDS=com.lattelink.rawaq.beta,com.lattelink.rawaq`
  - `PAYMENTS_PROVIDER_MODE=simulated`
  - `ALLOW_DEV_CUSTOMER_LOGIN=true`

- `production`
  - `API_DOMAIN=api.nomly.us`
  - `CLIENT_DASHBOARD_DOMAIN=app.nomly.us`
  - `COMPOSE_PROJECT_NAME=lattelink-prod`
  - `DEPLOY_ENABLED=false` until the production droplet is provisioned and reachable
  - `APPLE_SIGN_IN_ENABLED=true`
  - `APPLE_ALLOWED_CLIENT_IDS=com.lattelink.rawaq.beta,com.lattelink.rawaq`
  - `PAYMENTS_PROVIDER_MODE=live`
  - `ALLOW_DEV_CUSTOMER_LOGIN=false`

## Required environment secrets

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `LETSENCRYPT_EMAIL`
- `DATABASE_URL` or `POSTGRES_PASSWORD`
- `GATEWAY_INTERNAL_API_TOKEN`
- `ORDERS_INTERNAL_API_TOKEN`
- `LOYALTY_INTERNAL_API_TOKEN`
- `NOTIFICATIONS_INTERNAL_API_TOKEN`
- `JWT_SECRET`
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY`

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

## App environment mapping

Mobile:

- `beta` -> `dev`
- `production` -> `production`

Dashboard:

- local dashboard development should point to `dev`
- deployed dashboard should have separate `dev` and `production` builds/domains

## Host layout

Preferred:

- one host for `dev`
- one separate host for `production`

Acceptable temporarily:

- one larger host running both stacks with separate deploy paths and separate compose project names

Never share the same database, Redis instance, or payment credentials between `dev` and `production`.
