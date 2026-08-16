# LatteLink Platform

LatteLink is Nomly/Gazelle's commerce platform for mobile ordering, storefront ordering, client operations, admin operations, payments, loyalty, notifications, and merchant onboarding.

This is a private production monorepo. It contains the customer apps, operator/admin surfaces, API gateway, domain services, shared contracts, workers, deployment automation, and infrastructure configuration.

## Current Operating Model

- `develop` is the integration branch and deploys to the shared `dev` stack after images publish successfully.
- `main` is production-ready history.
- Production backend/API deploys are gated by a published GitHub Release, not by a plain push to `main`.
- GitHub Release tags use semantic versions: `vX.Y.Z`.
- The iOS App Store marketing version is kept aligned with the platform release when a native binary is shipped.
- Deployed Postgres data lives in external Supabase databases. The Compose Postgres service is local-only and must not be treated as deployed data.
- Admin console deployment is handled by Vercel Git integration. GitHub Actions verifies the admin console but does not run a token-based Vercel CLI deploy.

## Repository Map

```text
apps/
  mobile/             Expo iOS customer ordering app
  client-dashboard/   Client/operator dashboard
  admin-console/      Internal admin console
  lattelink-web/      Customer storefront web app

services/
  gateway/            Public API gateway and OpenAPI surface
  identity/           Customer, operator, owner, and internal-admin identity
  catalog/            Menu, catalog, media, availability, and location APIs
  orders/             Cart checkout, order draft/finalization, and lifecycle APIs
  payments/           Stripe/Clover integration and payment reconciliation
  loyalty/            Loyalty balance and ledger APIs
  notifications/      Push devices, receipts, and notification outbox APIs
  workers/            Menu sync, notification dispatch, payment reconciliation

packages/
  contracts/          Shared API contract packages
  sdk-mobile/         Generated mobile SDK types
  persistence/        Database migrations and persistence helpers
  event-bus/          Internal event primitives
  observability/      Logging and telemetry helpers
  design-tokens/      Shared UI tokens
  config-*/           Shared TypeScript and ESLint config

infra/
  free/               Compose deploy bundle and host scripts
  terraform/          Cloud infrastructure modules and environment config

docs/
  architecture/       Architecture and API contract notes
  runbooks/           Operational, release, QA, and deploy runbooks
  roadmaps/           Product and engineering roadmap documents
```

## Prerequisites

- Node.js `>=22`
- pnpm `10.5.2`
- Docker, for local Compose and deploy-bundle work
- Expo/EAS access for native mobile builds and OTA updates
- Terraform CLI for infrastructure work
- GitHub CLI for release/deploy operations

Install dependencies:

```bash
pnpm install
```

## Common Commands

Full repo validation:

```bash
pnpm verify
```

Individual phases:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Scoped package examples:

```bash
pnpm --filter @lattelink/gateway test
pnpm --filter @lattelink/client-dashboard typecheck
pnpm --filter @lattelink/mobile lint
```

Contracts and generated SDK:

```bash
pnpm contracts:openapi
pnpm contracts:drift
pnpm sdk:generate
```

Release policy tests:

```bash
pnpm test:release-policy
```

## Local Development

Start local API services:

```bash
pnpm dev:services
```

The gateway listens on `127.0.0.1:8080`.

Start local services for a physical device on the same LAN:

```bash
pnpm dev:services:lan
```

Start the mobile app against local services:

```bash
pnpm dev:mobile:local
```

Start the mobile app against LAN services:

```bash
pnpm dev:mobile:lan
```

Run a web surface:

```bash
pnpm --filter @lattelink/client-dashboard dev
pnpm --filter @lattelink/admin-console dev
pnpm --filter @lattelink/web dev
```

Useful local health checks:

```bash
curl -s http://127.0.0.1:8080/health
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3001/health
curl -s http://127.0.0.1:3004/health
```

See [Local Dev Stack](docs/runbooks/local-dev-stack.md) for the detailed local runbook.

## Environment And Data

Environment files are not committed. Start from the checked-in examples:

- [.env.example](.env.example)
- [apps/mobile/.env.example](apps/mobile/.env.example)
- [apps/client-dashboard/.env.example](apps/client-dashboard/.env.example)
- [apps/admin-console/.env.example](apps/admin-console/.env.example)
- [apps/lattelink-web/.env.example](apps/lattelink-web/.env.example)
- [infra/free/.env.example](infra/free/.env.example)

Deployed environments use external Supabase Postgres through `DATABASE_URL`. The Compose `postgres` service is only for local development and starts only with the explicit `local-db` profile.

Do not share databases, Redis instances, OAuth credentials, payment credentials, Apple keys, or internal API tokens across `dev` and `production`.

See:

- [Two-Environment Deploy](docs/runbooks/two-environment-deploy.md)
- [Database Backup And Restore](docs/runbooks/database-backup-restore.md)

## Database Migrations

Migrations live in [packages/persistence/src/migrations](packages/persistence/src/migrations).

Validate persistence:

```bash
pnpm --filter @lattelink/persistence test
pnpm --filter @lattelink/persistence typecheck
```

Run migrations only against the intended external database:

```bash
DATABASE_URL=<postgres-url> pnpm --filter @lattelink/persistence migrate
```

## Product Surfaces

### Mobile App

The customer iOS app is in [apps/mobile](apps/mobile). It uses Expo and EAS.

Common commands:

```bash
pnpm --filter @lattelink/mobile test
pnpm --filter @lattelink/mobile typecheck
pnpm --filter @lattelink/mobile release:classify
pnpm --filter @lattelink/mobile release:check -- production
pnpm --filter @lattelink/mobile update:beta
pnpm --filter @lattelink/mobile update:production
```

Use OTA updates for JavaScript, styling, copy, and compatible configuration changes. Use a native build when native dependencies, app config, entitlements, permissions, Expo SDK/native modules, build profiles, runtime version, or App Store metadata change.

Runbooks:

- [Mobile EAS Builds](docs/runbooks/mobile-eas-builds.md)
- [Mobile TestFlight Pilot Release](docs/runbooks/mobile-testflight-pilot-release.md)
- [Mobile Pilot Purchase Flow QA](docs/runbooks/mobile-pilot-purchase-flow-qa.md)

### Client Dashboard

The client dashboard is in [apps/client-dashboard](apps/client-dashboard). It is the operator-facing surface for store teams.

Important access rules:

- Owner access is provisioned through the internal admin path.
- Client dashboard team management must not assign or promote owner access.
- Client dashboard owners can manage manager/store accounts.
- Owner accounts can only be managed from the admin dashboard.

Runbooks:

- [Client Dashboard QA](docs/runbooks/client-dashboard-pilot-qa.md)
- [Client Dashboard Owner Provisioning](docs/runbooks/client-dashboard-owner-provisioning.md)

### Admin Console

The admin console is in [apps/admin-console](apps/admin-console). GitHub Actions verifies it, and Vercel Git integration owns deployment.

Runbook:

- [Admin Console Deployment](docs/runbooks/admin-console-vercel-deployment.md)

### Storefront Web

The storefront web app is in [apps/lattelink-web](apps/lattelink-web).

Runbook:

- [LatteLink Web Deployment](docs/runbooks/lattelink-vercel-deployment.md)

## Release Flow

Normal development:

1. Start from `origin/develop`.
2. Make the change.
3. Run relevant local validation.
4. Commit clearly.
5. Push to `origin/develop`.
6. Wait for GitHub Actions to publish images and deploy the SHA to `dev`.
7. Verify the deployed dev stack.

Production release:

1. Confirm the candidate SHA has passed in `dev`.
2. Fast-forward or merge the verified SHA to `main`.
3. Push `main`.
4. Wait for main CI, security, CodeQL, and image publishing to pass.
5. Create a non-draft, non-prerelease GitHub Release with a new advancing `vX.Y.Z` tag and release notes.
6. The `deploy-prod` workflow runs from the release event.
7. The production policy check verifies that the release tag points to current `origin/main`, the tag advances, and release notes are present.
8. Production deploy and smoke checks must pass.

Manual rollback dispatch:

```bash
gh workflow run deploy-prod.yml -f image_tag=<previous-known-good-full-sha>
```

Rollback dispatches are only for previous known-good SHAs that already exist on `origin/main`.

## GitHub Actions

Core workflows:

- `.github/workflows/ci.yml`
- `.github/workflows/publish-images.yml`
- `.github/workflows/deploy-dev.yml`
- `.github/workflows/deploy-prod.yml`
- `.github/workflows/admin-console-vercel.yml`
- `.github/workflows/lattelink-vercel.yml`
- `.github/workflows/codeql.yml`
- `.github/workflows/secret-scan.yml`
- `.github/workflows/dependency-review.yml`
- `.github/workflows/database-restore-drill.yml`
- `.github/workflows/uptime-monitor.yml`

Security, dependency, CodeQL, and release-policy checks must stay green before production promotion.

## Security

Security policy: [SECURITY.md](SECURITY.md)

Rules:

- Never commit secrets, `.env` files, tokens, keys, or production data.
- Store runtime secrets in GitHub Environments and managed secret stores.
- Treat Supabase connection strings, payment credentials, OAuth credentials, Apple keys, and internal API tokens as sensitive.
- Keep dependency overrides current.
- Review Dependabot and code scanning alerts before release.
- Report vulnerabilities to `security@gazellecoffee.com`.

## Key Docs

- [Architecture Overview](docs/architecture/architecture-overview.md)
- [API Contracts](docs/architecture/api-contracts.md)
- [Development Flow](docs/runbooks/development-flow.md)
- [Release Runbook](docs/runbooks/release-runbook.md)
- [Production Prerequisites](docs/runbooks/production-prerequisites.md)
- [Launch Readiness Checklist](docs/runbooks/launch-readiness-checklist.md)
- [Contract Drift Guardrails](docs/runbooks/contract-drift-guardrails.md)
- [Payment And Order Flow](docs/payment-order-flow.md)
- [Order Lifecycle](docs/order-lifecycle.md)
- [Platform Config](docs/platform-config.md)
