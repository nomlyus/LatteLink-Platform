# Architecture

Last verified: 2026-11-16, from `develop` code, workflows, and ADR 0002.
Replaces the April architecture doc, `docs/PROJECT_STATE.md`, and `docs/architecture/architecture-overview.md`. Those are kept in [docs/archive/state-snapshots](docs/archive/state-snapshots) for history.

## Overview

Nomly is a TypeScript monorepo (pnpm + Turborepo). The backend is a set of Fastify domain services behind a gateway. In deployed environments, all of them run inside **one Heroku process** (`services/backend-runtime`); locally they can run as separate processes. All services share one external Supabase Postgres database per environment, with tables namespaced by service.

## Surfaces

| Surface | Path | Stack | Hosting | Users |
|---|---|---|---|---|
| Customer app | `apps/mobile` | Expo / React Native, Expo Router, Stripe RN SDK | App Store (one branded build per merchant brand), EAS Update | Café customers |
| Merchant dashboard | `apps/client-dashboard` | Next.js (React) | Vercel | Owners, managers, store staff |
| Admin console | `apps/admin-console` | Next.js | Vercel (Git integration) | Nomly internal |
| Marketing site | `apps/lattelink-web` | Next.js | Vercel | Prospective merchants |

## Runtime

```
Customer app ─┐
Dashboard ────┼──► https://api.nomly.us (prod) / api-dev.nomly.us (dev)
Admin console ┘        │  Heroku TLS
                       ▼
          Heroku app: nomly-api-prod (Basic dyno) / nomly-api-dev (Eco dyno)
          ┌────────────────────────────────────────────────────────────┐
          │ services/backend-runtime (one Node process)                │
          │   gateway  ← only listener on Heroku $PORT                 │
          │     ├─ identity   ├─ catalog   ├─ orders                   │
          │     ├─ payments   ├─ loyalty   ├─ notifications            │
          │     └─ reporting           (loopback ports)                │
          │   in-process workers: notifications-dispatch,              │
          │     payment-reconciler, menu-sync (optional)               │
          └────────────────────────────────────────────────────────────┘
                       │ session pooler (IPv4)
                       ▼
          External Supabase Postgres (separate dev and prod projects)
```

- **Migrations** run in Heroku's release phase (`node dist/migrate.js`, see `heroku.yml`) before a new release takes traffic.
- **No Valkey/Redis on Heroku.** With one dyno, order streams use their polling fallback and rate limits are process-local (ADR 0002).
- **The dev dyno sleeps when idle** (Eco). The first request after a sleep can take more than 10 s.
- **The mobile release worker** (`services/workers/mobile-release`) is not in the Heroku process. Building App Store binaries needs a separate EAS-capable environment.
- **Terraform** in `infra/terraform` (AWS ECS/RDS) is defined but not deployed. Scaling triggers are in ADR 0002 and issue #455.

## Tenancy model

- **Brand** = a merchant business (e.g. Rawaq, Hazel). **Location** = one of its stores.
- Each brand gets its own branded iOS app, with location selection inside it.
- Catalog, orders, store config, operator access, and push tokens are scoped by location and/or brand. Public and customer endpoints require a `brandId` (and `locationId` where relevant).
- **Loyalty is brand-wide** (migration 0059): balances and programs belong to a brand and apply across its participating locations.
- **Customer identity is global** (`identity_users`). Per-brand customer accounts (one person, separate account per merchant) are **not built yet**. See #536; it's required before a second merchant goes live.

## Authentication

| Population | Method | Tokens |
|---|---|---|
| Customers | Sign in with Apple (prod); `dev-access` on dev only | JWT access + fixed-length random refresh tokens, absolute session TTL |
| Operators | Email/password, Google SSO | Same |
| Internal admin | Email/password | Same |

The gateway verifies access tokens and forwards identity to services (`x-user-id`, `x-gateway-token`). Service-to-service calls use internal tokens. Passkey routes exist server-side, but customer enrollment is disabled pending security review (TD-16). Operator Apple sign-in and passkeys are open issues #360–#362.

## Payments

- **Stripe Connect** is the only live payment path. Each merchant has a Connect account; the app creates a checkout draft, opens Stripe PaymentSheet (card + Apple Pay), and the draft becomes an order only after payment is verified. A background reconciler recovers drafts whose webhooks were missed. Operator refunds are supported (full refunds; partial refunds are #511).
- **Clover** code remains but is unavailable. Its only planned future is a read-only reporting import (#290).

## Order lifecycle

Fulfillment mode is per location. The default is **`staff`**: orders advance only when the dashboard moves them. `time_based` (auto-advance on a timer) exists for testing only. See [docs/order-lifecycle.md](docs/order-lifecycle.md) and [docs/payment-order-flow.md](docs/payment-order-flow.md).

## Shared packages

| Package | Purpose |
|---|---|
| `packages/contracts/*` | Zod API contracts (core, auth, catalog, orders, loyalty, notifications). The single source for request and response shapes |
| `packages/sdk-mobile` | Typed client generated from the gateway OpenAPI, used by the mobile app |
| `packages/persistence` | Kysely + Postgres repositories and numbered migrations |
| `packages/observability` | Structured logging and Sentry |
| `packages/event-bus` | Order event pub/sub (used when Valkey is present) |
| `packages/design-tokens` | Shared UI tokens |

## Delivery

- **CI** (`ci.yml`): lint, typecheck, tests, contract drift, build, release-policy tests. Security: CodeQL, secret scan, dependency review.
- **Dev**: a push to `develop`, then CI, then `deploy-dev.yml` pushes the commit to `nomly-api-dev`, verifies release and migration provenance, smoke-checks, and runs a deployed checkout E2E.
- **Prod**: promote `develop` to `main`, publish a GitHub Release `vX.Y.Z`, and `deploy-prod.yml` deploys `nomly-api-prod` behind the release-policy gate. See [docs/runbooks/development-flow.md](docs/runbooks/development-flow.md).
- **Web apps** deploy through Vercel. **Mobile** ships as EAS builds (binary) or EAS Update (OTA).
- **Monitoring**: Sentry, plus `uptime-monitor.yml`, which opens and closes GitHub issues for failing health checks.

## Decisions

- [ADR 0001: Monorepo architecture](docs/adr/0001-monorepo-architecture.md)
- [ADR 0002: Heroku backend runtime](docs/adr/0002-heroku-backend-runtime.md)
