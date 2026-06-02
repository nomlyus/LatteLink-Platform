# LatteLink Platform

LatteLink is Gazelle's ordering, loyalty, payments, and operator platform. This repository is a private production monorepo containing the customer mobile app, storefront web app, client dashboard, admin console, API gateway, domain services, workers, shared contracts, deployment scripts, and infrastructure configuration.

The platform supports a two-environment delivery model:

- `develop` is the shared integration branch and auto-deploys to the `dev` stack.
- `main` is production-ready history.
- Production deploys are deliberate and use a verified full git SHA plus a semantic release tag.

## Repository Map

```text
apps/
  mobile/             Expo customer ordering app
  client-dashboard/   Client/operator dashboard
  admin-console/      Internal admin console
  lattelink-web/      Customer storefront web app

services/
  gateway/            Public API gateway and OpenAPI surface
  identity/           Customer, operator, owner, and session identity
  catalog/            Menu, catalog, media, and availability APIs
  orders/             Cart checkout, order lifecycle, and fulfillment APIs
  payments/           Payment provider integration and reconciliation
  loyalty/            Loyalty balance and ledger APIs
  notifications/      Push notification device and outbox APIs
  workers/            Menu sync, notification dispatch, payment reconciliation

packages/
  contracts/          Shared Zod/API contract packages
  sdk-mobile/         Generated mobile SDK types
  persistence/        Database migrations and persistence helpers
  event-bus/          Internal event primitives
  observability/      Logging and telemetry helpers
  design-tokens/      Shared UI tokens
  config-*/           Shared TypeScript and ESLint config

infra/
  free/               Compose-based deploy bundle and host scripts
  terraform/          Cloud infrastructure modules and envs

docs/
  architecture/       System architecture and API contract notes
  runbooks/           Operational, release, QA, and deploy runbooks
  roadmaps/           Product and engineering roadmap documents
```

## Prerequisites

- Node.js `>=22`
- pnpm `10.5.2`
- Docker, when running the Compose stack or deploy tooling
- Expo/EAS CLI access for native mobile builds
- Terraform CLI for infrastructure work

Install dependencies from the repo root:

```bash
pnpm install
```

## Common Commands

Run all standard validation:

```bash
pnpm verify
```

Run individual validation phases:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run a scoped package command:

```bash
pnpm --filter @lattelink/gateway test
pnpm --filter @lattelink/client-dashboard typecheck
pnpm --filter @lattelink/mobile lint
```

Generate and verify API contracts:

```bash
pnpm contracts:openapi
pnpm contracts:drift
pnpm sdk:generate
```

Run release policy checks:

```bash
pnpm test:release-policy
```

## Local Development

Start local API services on localhost:

```bash
pnpm dev:services
```

This starts identity, orders, catalog, payments, loyalty, notifications, and gateway. Gateway listens on `127.0.0.1:8080`.

Start local API services for a physical device on the same network:

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

Run a specific web app:

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

See [Local Dev Stack](docs/runbooks/local-dev-stack.md) for the full local app and API runbook.

## Environment And Data Policy

Environment files are intentionally not committed. Use the checked-in examples as templates:

- [.env.example](.env.example)
- [apps/mobile/.env.example](apps/mobile/.env.example)
- [apps/client-dashboard/.env.example](apps/client-dashboard/.env.example)
- [apps/admin-console/.env.example](apps/admin-console/.env.example)
- [apps/lattelink-web/.env.example](apps/lattelink-web/.env.example)
- [infra/free/.env.example](infra/free/.env.example)

Deployed environments use external Supabase Postgres through `DATABASE_URL`. The bundled Compose `postgres` service is local-only and starts only when explicitly requested with the `local-db` profile.

Do not point `dev` and `production` at the same database, Redis instance, or payment credentials. See [Two-Environment Deploy](docs/runbooks/two-environment-deploy.md) for the required environment variables, secrets, Supabase pool policy, and deploy sequencing.

## Database Migrations

Migrations live in [packages/persistence/src/migrations](packages/persistence/src/migrations).

Run persistence package validation:

```bash
pnpm --filter @lattelink/persistence test
pnpm --filter @lattelink/persistence typecheck
```

Run migrations only against the intended database URL:

```bash
DATABASE_URL=<postgres-url> pnpm --filter @lattelink/persistence migrate
```

For backup, restore, and Supabase drill procedures, use [Database Backup And Restore](docs/runbooks/database-backup-restore.md).

## Mobile App Releases

The mobile app lives in [apps/mobile](apps/mobile). It is an Expo app with EAS build/update workflows.

Common commands:

```bash
pnpm --filter @lattelink/mobile test
pnpm --filter @lattelink/mobile typecheck
pnpm --filter @lattelink/mobile release:classify
pnpm --filter @lattelink/mobile release:check
pnpm --filter @lattelink/mobile update:beta
pnpm --filter @lattelink/mobile update:production
```

Prefer OTA updates when a change is JavaScript, styling, copy, configuration, or API behavior that does not require native binary changes. Use a new native build when the change affects native dependencies, app config, entitlements, permissions, Expo SDK/native modules, build profiles, or App Store metadata.

See:

- [Mobile EAS Builds](docs/runbooks/mobile-eas-builds.md)
- [Mobile TestFlight Pilot Release](docs/runbooks/mobile-testflight-pilot-release.md)
- [Mobile Pilot Purchase Flow QA](docs/runbooks/mobile-pilot-purchase-flow-qa.md)

## Client And Admin Surfaces

The client dashboard is the operator-facing surface for client teams. Owner access and owner provisioning are controlled through the internal/admin path; client dashboard team management must not allow owner-role assignment.

Relevant runbooks:

- [Client Dashboard QA](docs/runbooks/client-dashboard-pilot-qa.md)
- [Client Dashboard Owner Provisioning](docs/runbooks/client-dashboard-owner-provisioning.md)
- [Admin Console Deployment](docs/runbooks/admin-console-vercel-deployment.md)
- [LatteLink Web Deployment](docs/runbooks/lattelink-vercel-deployment.md)

## Release And Deployment Flow

The authoritative development and release policy is [Development Flow](docs/runbooks/development-flow.md).

Daily flow:

1. Start from `origin/develop`.
2. Make the change locally.
3. Run relevant validation.
4. Commit with a clear message.
5. Push to `origin/develop`.
6. Let GitHub Actions publish images and deploy that SHA to `dev`.
7. Verify the deployed `dev` environment.

Production flow:

1. Promote the exact verified SHA to `main`.
2. Run `deploy-prod` with `release_kind=release`, a full `image_tag` SHA on `origin/main`, and the next semantic `release_tag`.
3. Let production smoke checks pass.
4. The workflow creates the release tag after the production smoke check.
5. Create or update the GitHub Release notes and changelog record as needed.

Example production release command:

```bash
gh workflow run deploy-prod.yml \
  -f image_tag=<verified-main-sha> \
  -f release_kind=release \
  -f release_tag=v1.0.6
```

Rollback uses the same workflow with a previous known-good SHA and `release_kind=rollback`.

## GitHub Actions

Key workflows:

- `.github/workflows/ci.yml`
- `.github/workflows/publish-images.yml`
- `.github/workflows/deploy-dev.yml`
- `.github/workflows/deploy-prod.yml`
- `.github/workflows/codeql.yml`
- `.github/workflows/secret-scan.yml`
- `.github/workflows/dependency-review.yml`
- `.github/workflows/database-restore-drill.yml`
- `.github/workflows/uptime-monitor.yml`

Security and dependency workflows must stay green before promotion to production.

## Security

Security policy: [SECURITY.md](SECURITY.md)

Rules:

- Never commit secrets, `.env` files, tokens, keys, or production data.
- Store runtime secrets in GitHub Environments and managed secret stores.
- Treat Supabase connection strings, payment credentials, OAuth credentials, Apple keys, and internal API tokens as sensitive.
- Keep dependency overrides current and review Dependabot/security alerts before release.
- Report vulnerabilities to `security@gazellecoffee.com`.

## Important Docs

- [Architecture Overview](docs/architecture/architecture-overview.md)
- [API Contracts](docs/architecture/api-contracts.md)
- [Release Runbook](docs/runbooks/release-runbook.md)
- [Production Prerequisites](docs/runbooks/production-prerequisites.md)
- [Launch Readiness Checklist](docs/runbooks/launch-readiness-checklist.md)
- [Contract Drift Guardrails](docs/runbooks/contract-drift-guardrails.md)
- [Payment And Order Flow](docs/payment-order-flow.md)
- [Order Lifecycle](docs/order-lifecycle.md)
- [Platform Config](docs/platform-config.md)
