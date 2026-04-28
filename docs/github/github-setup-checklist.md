# GitHub Setup Checklist

Last reviewed: `2026-04-27`

The authoritative workflow policy for this repo lives in [development-flow.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/development-flow.md). The deployment model lives in [two-environment-deploy.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/two-environment-deploy.md). Use this checklist only to configure GitHub so it matches those docs.

## Repository

- [x] default branch: `main`
- [x] allow merge commits
- [x] allow squash merges
- [x] disable rebase merges
- [x] delete head branches on merge

Merge methods may stay enabled, but they are not required for normal delivery.

## Branch Protection

### `develop`

- [x] do not require pull requests
- [x] do not block direct pushes
- [ ] require conversation resolution only if you want optional review discipline

`develop` should allow direct pushes. It is the auto-deploy branch for the shared `dev` environment.

### `main`

- [x] do not require pull requests
- [x] do not block direct pushes
- [ ] require conversation resolution only if you want optional review discipline

`main` should stay reserved for production-ready history. It does not auto-deploy by itself.

## Actions Workflows

- [x] `publish-images` runs on every `develop` and `main` push and tags images with the full git SHA
- [x] `deploy-dev` runs after successful image publish on `develop`
- [x] `deploy-prod` supports manual `workflow_dispatch` promotion using a full git SHA
- [x] `production` does not auto-deploy on every push
- [x] there is no workflow that requires PR metadata, branch naming, or issue labels before shipping

## Issues And PRs

- [x] blank issues are allowed
- [x] issue labels are optional
- [x] there is no workflow that syncs labels from issue bodies
- [x] PR templates are not required for normal delivery
- [x] direct pushes to `develop` are the default workflow

## GitHub Environments

- [ ] `dev`
- [ ] `production`

Each environment should define its own vars and secrets. See [two-environment-deploy.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/two-environment-deploy.md) for the exact matrix.

## Core Variables

- [ ] `API_DOMAIN`
- [ ] `CLIENT_DASHBOARD_DOMAIN`
- [ ] `DEPLOY_PATH`
- [ ] `IMAGE_REGISTRY_PREFIX`
- [ ] `PASSKEY_RP_ID`
- [ ] `COMPOSE_PROJECT_NAME`
- [ ] `CORS_ALLOWED_ORIGINS`
- [ ] `ALLOW_DEV_CUSTOMER_LOGIN`
- [ ] `PAYMENTS_PROVIDER_MODE`
- [ ] `CLOVER_OAUTH_ENVIRONMENT`
- [ ] `GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS`

## Core Secrets

- [ ] `DEPLOY_HOST`
- [ ] `DEPLOY_USER`
- [ ] `DEPLOY_SSH_KEY`
- [ ] `DATABASE_URL`
- [ ] `GATEWAY_INTERNAL_API_TOKEN`
- [ ] `ORDERS_INTERNAL_API_TOKEN`
- [ ] `LOYALTY_INTERNAL_API_TOKEN`
- [ ] `NOTIFICATIONS_INTERNAL_API_TOKEN`
- [ ] `JWT_SECRET`
- [ ] `LETSENCRYPT_EMAIL`
- [ ] `APPLE_TEAM_ID`
- [ ] `APPLE_KEY_ID`
- [ ] `APPLE_PRIVATE_KEY`
- [ ] GitHub Environment var `APPLE_ALLOWED_CLIENT_IDS`

## Optional Secrets

- [ ] `GOOGLE_OAUTH_CLIENT_ID`
- [ ] `GOOGLE_OAUTH_CLIENT_SECRET`
- [ ] `GOOGLE_OAUTH_STATE_SECRET`
- [ ] `CLOVER_APP_ID`
- [ ] `CLOVER_APP_SECRET`
- [ ] `CLOVER_OAUTH_REDIRECT_URI`
- [ ] `CLOVER_OAUTH_STATE_SECRET`
- [ ] `CLOVER_WEBHOOK_SHARED_SECRET`
- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_PUBLISHABLE_KEY`
- [ ] `STRIPE_CONNECT_WEBHOOK_SECRET`
- [ ] `CATALOG_MEDIA_R2_ACCESS_KEY_ID`
- [ ] `CATALOG_MEDIA_R2_SECRET_ACCESS_KEY`

## Unchanged Frontend Deploy Secrets

- [ ] `CLIENT_DASHBOARD_VERCEL_TOKEN`
- [ ] `CLIENT_DASHBOARD_VERCEL_ORG_ID`
- [ ] `CLIENT_DASHBOARD_VERCEL_PROJECT_ID`
- [ ] `CLIENT_DASHBOARD_VERCEL_ENV`
- [ ] `LATTELINK_VERCEL_TOKEN`
- [ ] `LATTELINK_VERCEL_ORG_ID`
- [ ] `LATTELINK_VERCEL_PROJECT_ID`
