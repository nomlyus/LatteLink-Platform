# Architecture

Last verified: 2026-04-27 (from code, not from documentation)

## Overview

LatteLink is a TypeScript monorepo built with pnpm + Turborepo. The backend is a set of Fastify microservices behind a gateway, all sharing a single Postgres database with table-prefix namespacing per service. The event bus is Redis pub/sub via Valkey. Production deployment is Docker Compose on a single Linux host with Caddy for TLS termination.

## Monorepo Structure

```
apps/
  mobile/              Expo iOS ordering app (customer-facing)
  client-dashboard/    Merchant operator dashboard (Next.js App Router)
  admin-console/       Internal Nomly control plane (Next.js)
  lattelink-web/       Public marketing site (Next.js)

services/
  gateway/             Public API gateway + auth enforcement (Fastify)
  identity/            Auth: Apple, passkey, operator, internal admin (Fastify)
  catalog/             Menu, app config, store config, home cards (Fastify)
  orders/              Quote → create → pay → fulfillment lifecycle (Fastify)
  payments/            Clover + Stripe + Apple Pay (Fastify)
  loyalty/             Points balance + ledger (Fastify)
  notifications/       Push token registration + outbox (Fastify)
  workers/
    menu-sync/         Periodic external menu import
    notifications-dispatch/ Outbox trigger

packages/
  contracts/           Zod API contracts (auth, catalog, orders, loyalty, notifications, core)
  persistence/         Kysely + Postgres, 29 migrations as of 2026-04-27
  event-bus/           Redis pub/sub for order events (ioredis)
  sdk-mobile/          Generated TypeScript client from gateway OpenAPI
  design-tokens/       Shared visual tokens
  config-eslint/       Shared ESLint config
  config-typescript/   Shared TypeScript config

infra/
  free/                Docker Compose single-host deployment (ACTIVE)
  terraform/           AWS modules (dev/staging/prod) — defined, not yet deployed
  docker/              Shared Node.js service Dockerfile
```

## Runtime Architecture

```
Customer iOS app
  │ HTTPS (Caddy TLS)
  ▼
gateway :8080
  ├── JWT auth middleware
  ├── Rate limiting (per-IP via Valkey)
  ├── CORS enforcement
  └── Reverse proxy to downstream services
       ├── identity  :3000
       ├── orders    :3001
       ├── catalog   :3002
       ├── payments  :3003
       ├── loyalty   :3004
       └── notifications :3005

Operator dashboard (Next.js App Router) → gateway (same path)
Admin console (Next.js on Vercel) → gateway (internal-admin token)

Event bus: Valkey (Redis-compatible pub/sub)
  - Orders service publishes to order_status:{orderId} and order_events:{locationId}
  - Gateway subscribes for order SSE streams

Postgres (shared, one DB, prefix-per-service namespacing):
  identity_*, operator_*, catalog_*, orders*, payments_*, loyalty_*, notifications_*

Workers (polling, not event-driven):
  menu-sync: Polls external URL → PUT /v1/catalog/internal/locations/:id/menu
  notifications-dispatch: Polls notifications service outbox every 5s
```

## Authentication

Three distinct auth populations:

| Population | Auth method | Token type |
|---|---|---|
| Customers | Apple Sign In (prod), dev-access (dev) | JWT HS256 (access + refresh) |
| Operators | Email/password + Google SSO | JWT HS256 (access + refresh) |
| Internal admin | Email/password only | JWT HS256 (access + refresh) |

The gateway decodes JWT access tokens and forwards user identity to downstream services via `x-user-id` and `x-gateway-token` headers. Internal service-to-service calls use static `x-internal-token` secrets.

Passkey (WebAuthn) route implementation exists, but customer enrollment is intentionally unavailable in Nomly 1.2.0 pending authenticated account binding and security review. Mobile UI is not built; route presence does not mean the feature is exposed to customers.

## Payment Architecture

Payment capabilities and product status:

- **Stripe Connect**: Per-merchant Connect accounts. Mobile PaymentIntent session → Stripe PaymentSheet → webhook reconciliation → Nomly order PAID. Apple Pay is part of Stripe PaymentSheet. This is the customer mobile-ordering payment path in Nomly 1.2.0; Nomly owns the order lifecycle.
- **Clover**: Legacy OAuth/POS paths exist in source but are unavailable in Nomly 1.2.0. Clover is not the destination for app orders. The intended future integration is read-only full-day reporting that combines Nomly orders with Clover in-store sales; that reporting capability is not implemented yet.

Payment profile per location is stored in `catalog_payment_profiles`. The payments service reads this to route charges to the correct Stripe Connected Account.

## Multi-Tenancy State (2026-04-27)

The platform supports multiple merchants via `location_id` keyed data:

- `catalog_*` tables: keyed by `location_id` ✓
- `orders` table: captures `locationId` in `order_json` ✓
- `operator_users`: keyed by `location_id` ✓
- `operator_location_access`: added for multi-location operator access ✓
- `loyalty_balances`: NOT scoped by location — uses only `user_id` as PK ✗ (TD-02)
- `identity_users`: shared pool (intentional — customers are platform-wide)
- Mobile app: single-tenant per EAS build (brand/theme baked at build time)

One live tenant as of audit date: `rawaqcoffee` / `rawaqcoffee01`.

## Data Ownership

All services read and write to the same Postgres instance. Data ownership by table prefix:

| Service | Tables |
|---|---|
| identity | identity_users, identity_sessions, identity_passkey_*, operator_users, operator_sessions, operator_location_access, internal_admin_* |
| catalog | catalog_menu_categories, catalog_menu_items, catalog_store_configs, catalog_app_configs, catalog_home_news_cards, catalog_payment_profiles |
| orders | orders, orders_quotes, orders_create_idempotency, orders_payment_idempotency |
| payments | payments_charges, payments_refunds, payments_stripe_webhook_events, payments_clover_* |
| loyalty | loyalty_balances, loyalty_ledger_entries, loyalty_idempotency_keys |
| notifications | notifications_push_tokens, notifications_order_state_dispatches, notifications_outbox |

## Fulfillment Modes

The platform supports two order fulfillment modes, configured per location via `app_config`:

- `staff`: Order progresses only when a dashboard operator manually advances the status. Recommended for all real merchants.
- `time_based`: Order auto-progresses on a timer from payment. Used for testing only. **Must not be used in production.**

## Observability (Current Gaps)

Services expose `GET /health` and `GET /ready`. There is no `/metrics` endpoint. There is no structured log aggregation, no error tracking (Sentry), and no uptime monitoring. This is a known gap (TD-06).

## API Surface

Gateway base path: `https://{API_DOMAIN}/v1`

Key route groups:
- `/auth/*` — customer authentication
- `/operator/auth/*` — operator authentication
- `/internal-admin/auth/*` — internal admin authentication
- `/menu`, `/app-config`, `/store/config`, `/store/cards` — public catalog reads
- `/orders/*` — customer order lifecycle
- `/admin/orders/*`, `/admin/menu/*`, `/admin/cards/*`, `/admin/store/*`, `/admin/staff/*` — operator management
- `/internal/*` — internal admin / platform operations
- `/payments/*` — payment sessions and webhooks
- `/loyalty/*` — loyalty balance and ledger
- `/devices/push-token` — push notification registration

All routes are defined in `services/gateway/src/routes.ts` and typed against contracts in `packages/contracts/*`.

## Infrastructure

### Current (active)
- Single Ubuntu host
- Docker Compose with Caddy, gateway, all services, workers, Postgres, Valkey
- GHCR for container images
- Vercel for Next.js apps (admin-console, client-dashboard, lattelink-web)

### Planned (not deployed)
- Terraform modules for AWS (ECS/RDS/ElastiCache) in `infra/terraform/`
- dev/staging/prod Terraform environments defined

## CI/CD

GitHub Actions:
- `ci.yml`: lint, typecheck, unit tests, contract drift check, build — runs on all PRs and main pushes
- `publish-free-images.yml`: builds and pushes GHCR container images on main push
- `deploy-free.yml`: deploys to single-host via SSH
- `client-dashboard-vercel.yml`: deploys client dashboard to Vercel
- `admin-console-vercel.yml`: deploys admin console to Vercel
- `lattelink-vercel.yml`: deploys marketing site to Vercel
- `codeql.yml`: static analysis
- `secret-scan.yml`: secret scanning
