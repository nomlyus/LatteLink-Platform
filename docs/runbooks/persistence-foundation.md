# Persistence Foundation (Postgres Bootstrap)

Last reviewed: `2026-04-01`

## Scope

Initial persistence foundation is now wired for `payments`, `loyalty`, `orders`, `identity`, and `notifications` with explicit fallback behavior:

- If `DATABASE_URL` is set and reachable, services persist business state in Postgres.
- In-memory mode is allowed automatically in `NODE_ENV=test`.
- Outside tests, in-memory mode only activates when `ALLOW_IN_MEMORY_PERSISTENCE=true`.
- If Postgres is required and `DATABASE_URL` is missing or initialization fails, service startup fails instead of silently switching to memory.

## Shared Package

Persistence bootstrap lives in:

- `packages/persistence/src/index.ts`

It provides:

- `createPostgresDb(connectionString)`
- `getDatabaseUrl()`
- `runMigrations(db)`
- `ensurePersistenceTables(db)` (deprecated compatibility export)

`runMigrations` applies the numbered persistence migration history for:

- `payments_charges`
- `payments_refunds`
- `payments_webhook_deduplication`
- `payments_clover_connections`
- `loyalty_balances`
- `loyalty_ledger_entries`
- `loyalty_idempotency_keys`
- `orders_quotes`
- `orders`
- `orders_create_idempotency`
- `orders_payment_idempotency`
- `identity_users`
- `identity_magic_links`
- `identity_sessions`
- `identity_passkey_challenges`
- `identity_passkey_credentials`
- `operator_users`
- `operator_magic_links`
- `operator_sessions`
- `notifications_push_tokens`
- `notifications_order_state_dispatches`
- `notifications_outbox`
- `catalog_menu_categories`
- `catalog_menu_items`
- `catalog_store_configs`
- `catalog_app_configs`

## Payments Integration

`services/payments` now uses repository-style persistence selection at startup.

- `GET /ready` includes `persistence` backend (`memory` or `postgres`).
- Existing API contract behavior remains unchanged.

## Loyalty Integration

`services/loyalty` now uses repository-style persistence selection at startup.

- `GET /ready` includes `persistence` backend (`memory` or `postgres`).
- Balance, ledger entries, and idempotency records are persisted when Postgres is available.
- Existing API contract behavior remains unchanged.

## Orders Integration

`services/orders` now uses repository-style persistence selection at startup.

- `GET /ready` includes `persistence` backend (`memory` or `postgres`).
- Quote/order lifecycle, create idempotency, payment idempotency, and payment/refund artifacts persist when Postgres is available.
- Existing API contract behavior remains unchanged.

## Identity Integration

`services/identity` now uses repository-style persistence selection at startup.

- `GET /ready` includes `persistence` backend (`memory` or `postgres`).
- Sessions are persisted and evaluated for token validity (`/v1/auth/me`, `/v1/auth/refresh`, `/v1/auth/logout`).
- Passkey challenge issuance stores challenge records to support challenge lifecycle persistence.
- WebAuthn credential metadata (credential id/public key/counter/device type/backed-up state) is persisted and used for auth verification + counter updates.

## Notifications Integration

`services/notifications` now uses repository-style persistence selection at startup.

- `GET /ready` includes `persistence` backend (`memory` or `postgres`).
- Push token registration, order-state deduplication keys, and notification outbox entries persist when Postgres is available.
- Worker-driven outbox processing endpoint is available at `POST /v1/notifications/internal/outbox/process`.

## Environment

Set for DB-backed mode:

```bash
DATABASE_URL=postgres://user:password@host:5432/gazelle
```

Set for explicit non-durable local simulation mode:

```bash
ALLOW_IN_MEMORY_PERSISTENCE=true
```

Run migrations manually:

```bash
pnpm --filter @lattelink/persistence migrate
```

Without `DATABASE_URL`, services now require `ALLOW_IN_MEMORY_PERSISTENCE=true` unless they are running under `NODE_ENV=test`.

## Next Work

- Add transactional boundaries for cross-service side effects.
- Expand migration coverage as new persistence-backed features land.
- Keep the free-first scratch restore drill current as new persistence-backed tables are added.
