# Persistence Foundation (Postgres Bootstrap)

Last reviewed: `2026-03-11`

## Scope

Initial persistence foundation is now wired for `payments`, `loyalty`, `orders`, `identity`, and `notifications` with automatic fallback behavior:

- If `DATABASE_URL` is set and reachable, services persist business state in Postgres.
- If `DATABASE_URL` is missing or initialization fails, services fall back to in-memory storage and log the fallback.

## Shared Package

Persistence bootstrap lives in:

- `packages/persistence/src/index.ts`

It provides:

- `createPostgresDb(connectionString)`
- `getDatabaseUrl()`
- `ensurePersistenceTables(db)`

`ensurePersistenceTables` currently provisions foundational tables for:

- `payments_charges`
- `payments_refunds`
- `loyalty_balances`
- `loyalty_ledger_entries`
- `loyalty_idempotency_keys`
- `orders_quotes`
- `orders`
- `orders_create_idempotency`
- `orders_payment_idempotency`
- `identity_sessions`
- `identity_passkey_challenges`
- `identity_passkey_credentials`
- `notifications_push_tokens`
- `notifications_order_state_dispatches`
- `notifications_outbox`

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

Without `DATABASE_URL`, service behavior remains unchanged from prior local/dev simulation mode.

## Next Work

- Add transactional boundaries for cross-service side effects.
- Introduce dedicated migration runner and versioned migrations.
