# GitHub Setup Checklist

Last reviewed: `2026-04-04`

The authoritative workflow policy for this repo lives in [development-flow.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/development-flow.md). Use this checklist only to configure GitHub so it matches that policy.

## Repository

- [x] default branch: `main`
- [x] allow merge commits
- [x] allow squash merges
- [x] disable rebase merges
- [x] delete head branches on merge

Merge methods may stay enabled, but they are no longer part of the required shipping path because direct pushes to `main` are allowed.

## Branch Protection

### `main`

- [ ] require pull requests
- [ ] block direct pushes
- [ ] require conversation resolution
- [ ] require status checks before pushing

`main` should allow direct pushes.

### `dev`

- [ ] no required protection

`dev` is no longer part of the required release flow and does not need special GitHub enforcement.

## Actions Workflows

- [x] `publish-free-images` runs on every `main` push and tags images with the full git SHA
- [x] `deploy-free` runs after successful image publish on `main`
- [x] `deploy-free` supports manual `workflow_dispatch` redeploys using a full git SHA
- [x] there is no workflow that deploys `dev`
- [x] there is no workflow that requires PR metadata, branch naming, or issue labels before shipping to `main`

## Issues And PRs

- [x] blank issues are allowed
- [x] issue labels are optional
- [x] there is no workflow that syncs labels from issue bodies
- [x] PR templates are not required for normal delivery
- [x] direct pushes to `main` are the default workflow

## Variables

- [ ] `FREE_API_DOMAIN`
- [ ] `FREE_DEPLOY_PATH`
- [ ] `FREE_IMAGE_REGISTRY_PREFIX`
- [ ] `FREE_PASSKEY_RP_ID`
- [ ] `FREE_ALLOW_DEV_CUSTOMER_LOGIN`
- [ ] `FREE_CORS_ALLOWED_ORIGINS`
- [ ] `FREE_CLIENT_DASHBOARD_DOMAIN`
- [ ] `FREE_GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS`
- [ ] `FREE_PAYMENTS_PROVIDER_MODE`
- [ ] `FREE_CLOVER_OAUTH_ENVIRONMENT`
- [ ] `FREE_CLOVER_CHARGE_ENDPOINT`
- [ ] `FREE_CLOVER_REFUND_ENDPOINT`
- [ ] `FREE_CLOVER_APPLE_PAY_TOKENIZE_ENDPOINT`

## Secrets

- [ ] `FREE_DEPLOY_HOST`
- [ ] `FREE_DEPLOY_USER`
- [ ] `FREE_DEPLOY_SSH_KEY`
- [ ] `FREE_DATABASE_URL` or `FREE_POSTGRES_PASSWORD`
- [ ] `FREE_GATEWAY_INTERNAL_API_TOKEN`
- [ ] `FREE_ORDERS_INTERNAL_API_TOKEN`
- [ ] `FREE_LOYALTY_INTERNAL_API_TOKEN`
- [ ] `FREE_NOTIFICATIONS_INTERNAL_API_TOKEN`
- [ ] `FREE_JWT_SECRET`
- [ ] `FREE_APPLE_TEAM_ID` or `APPLE_TEAM_ID`
- [ ] `FREE_APPLE_KEY_ID` or `APPLE_KEY_ID`
- [ ] `FREE_APPLE_PRIVATE_KEY` or `APPLE_PRIVATE_KEY`
- [ ] `FREE_APPLE_CLIENT_ID` or `APPLE_CLIENT_ID`
- [ ] `FREE_APPLE_ALLOWED_CLIENT_IDS` or `APPLE_ALLOWED_CLIENT_IDS`
- [ ] `LETSENCRYPT_EMAIL`
- [ ] `FREE_GOOGLE_OAUTH_CLIENT_ID`
- [ ] `FREE_GOOGLE_OAUTH_CLIENT_SECRET`
- [ ] `FREE_GOOGLE_OAUTH_STATE_SECRET`
- [ ] `FREE_CLOVER_BEARER_TOKEN`
- [ ] `FREE_CLOVER_API_KEY`
- [ ] `FREE_CLOVER_API_ACCESS_KEY`
- [ ] `FREE_CLOVER_MERCHANT_ID`
- [ ] `FREE_CLOVER_APP_ID`
- [ ] `FREE_CLOVER_APP_SECRET`
- [ ] `FREE_CLOVER_OAUTH_REDIRECT_URI`
- [ ] `FREE_CLOVER_OAUTH_STATE_SECRET`
- [ ] `FREE_CLOVER_WEBHOOK_SHARED_SECRET`
- [ ] `CLIENT_DASHBOARD_VERCEL_TOKEN`
- [ ] `CLIENT_DASHBOARD_VERCEL_ORG_ID`
- [ ] `CLIENT_DASHBOARD_VERCEL_PROJECT_ID`
- [ ] `CLIENT_DASHBOARD_VERCEL_ENV`
- [ ] `GHCR_USERNAME` if GHCR images are private
- [ ] `GHCR_TOKEN` if GHCR images are private
