# GitHub Setup Checklist

Last reviewed: `2026-04-03`

## Repository

- [x] org: `GazelleDev`
- [x] repo: `GazelleMobilePlatform`
- [x] visibility: `public`
- [x] default branch: `main`
- [x] merge method: squash only

## Teams

Create:

- [x] `@GazelleDev/mobile`
- [x] `@GazelleDev/platform`
- [x] `@GazelleDev/infra`
- [x] `@GazelleDev/security`

## Branch Protection (`main`)

Enable:

- [x] pull request required
- [ ] minimum 1 approval (currently `0`)
- [ ] CODEOWNERS review required (currently disabled)
- [x] dismiss stale approvals
- [x] require conversation resolution
- [x] require linear history
- [ ] require signed commits (currently disabled)
- [x] block force pushes
- [x] block deletion

Required checks:

- [x] `lint`
- [x] `typecheck`
- [x] `unit-tests`
- [x] `contract-tests`
- [x] `build`
- [x] `terraform-validate`
- [x] `codeql`
- [x] `dependency-review`
- [x] `secret-scan`

## Environments

Create environments:

- [x] `dev`
- [x] `staging`
- [x] `prod`

Rules:

- [x] `dev`: auto deploy from `main`
- [x] `staging`: manual approval
- [x] `prod`: manual approval with reviewers `@GazelleDev/platform`, `@GazelleDev/infra`

## Project Board

Create project board columns:

- [x] Backlog
- [x] Ready
- [x] In Progress
- [x] Review
- [x] Done

## Repository Variables

- [x] `AWS_REGION=us-east-1`
- [x] `API_BASE_URL_DEV`
- [x] `API_BASE_URL_STAGING`
- [x] `API_BASE_URL_PROD`
- [ ] `FREE_API_DOMAIN`
- [ ] `FREE_DEPLOY_PATH`
- [ ] `FREE_IMAGE_REGISTRY_PREFIX`
- [ ] `FREE_PASSKEY_RP_ID`
- [ ] `FREE_CORS_ALLOWED_ORIGINS`
- [ ] `FREE_CLIENT_DASHBOARD_DOMAIN`
- [ ] `FREE_GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS`
- [ ] `FREE_PAYMENTS_PROVIDER_MODE`
- [ ] `FREE_CLOVER_OAUTH_ENVIRONMENT`
- [ ] `FREE_CLOVER_CHARGE_ENDPOINT`
- [ ] `FREE_CLOVER_REFUND_ENDPOINT`
- [ ] `FREE_CLOVER_APPLE_PAY_TOKENIZE_ENDPOINT`
- [ ] `FREE_IMAGE_TAG` (optional manual override for rollback or explicit redeploys)

## Environment Secrets

- [ ] `AWS_ROLE_ARN`
- [ ] `DATABASE_URL`
- [ ] `REDIS_URL`
- [ ] `APPLE_TEAM_ID`
- [ ] `APPLE_KEY_ID`
- [ ] `APPLE_PRIVATE_KEY`
- [ ] `APPLE_SERVICE_ID`
- [ ] `APPLE_MERCHANT_ID`
- [ ] `CLOVER_APP_ID`
- [ ] `CLOVER_APP_SECRET`
- [ ] `CLOVER_OAUTH_REDIRECT_URI`
- [ ] `CLOVER_OAUTH_STATE_SECRET`
- [ ] `CLOVER_BEARER_TOKEN`
- [ ] `CLOVER_API_ACCESS_KEY`
- [ ] `CLOVER_MERCHANT_ID`
- [ ] `SES_FROM_EMAIL`
- [ ] `EXPO_TOKEN`
- [ ] `JWT_PRIVATE_KEY`
- [ ] `JWT_PUBLIC_KEY`
- [ ] `FREE_DEPLOY_HOST`
- [ ] `FREE_DEPLOY_USER`
- [ ] `FREE_DEPLOY_SSH_KEY`
- [ ] `FREE_POSTGRES_PASSWORD`
- [ ] `FREE_GATEWAY_INTERNAL_API_TOKEN`
- [ ] `FREE_ORDERS_INTERNAL_API_TOKEN`
- [ ] `FREE_LOYALTY_INTERNAL_API_TOKEN`
- [ ] `FREE_NOTIFICATIONS_INTERNAL_API_TOKEN`
- [ ] `FREE_JWT_SECRET`
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
- [ ] `GHCR_USERNAME` (if GHCR images are private)
- [ ] `GHCR_TOKEN` (if GHCR images are private)

Notes:

- `gh secret list --repo AnxiousDaoud/LatteLink-Platform` and per-environment secret list commands returned no configured secrets on `2026-03-09`.
