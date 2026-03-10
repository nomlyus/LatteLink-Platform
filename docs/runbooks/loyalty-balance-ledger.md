# Loyalty Balance and Ledger (Local Runbook)

Last reviewed: `2026-03-10`

## Purpose

Validate loyalty balance and ledger behavior locally with deterministic points accounting and idempotent mutation handling.

## Service and Gateway Endpoints

- Loyalty service:
  - `GET /v1/loyalty/balance`
  - `GET /v1/loyalty/ledger`
  - `POST /v1/loyalty/internal/ledger/apply`
- Gateway proxy:
  - `GET /v1/loyalty/balance`
  - `GET /v1/loyalty/ledger`

## Accounting Rules

- `EARN`, `REDEEM`, and `REFUND` mutations use `amountCents` as the source of truth.
- If `points` is supplied for those types, it must equal `amountCents` (1 cent = 1 point).
- Ledger entry point deltas:
  - `EARN`: positive
  - `REDEEM`: negative
  - `REFUND`: positive
  - `ADJUSTMENT`: signed value from `points`
- `lifetimeEarned` increases only for `EARN`.
- Mutations cannot make `availablePoints` negative.
- `idempotencyKey` is scoped per user:
  - same key + same payload returns the original response
  - same key + different payload returns `409 IDEMPOTENCY_KEY_REUSE`

## Local Verification

Use the same UUID in all requests:

```bash
USER_ID="123e4567-e89b-12d3-a456-426614174900"
```

Apply an earn mutation:

```bash
curl -s http://127.0.0.1:3004/v1/loyalty/internal/ledger/apply \
  -H 'content-type: application/json' \
  -d "{
    \"userId\":\"${USER_ID}\",
    \"type\":\"EARN\",
    \"amountCents\":500,
    \"idempotencyKey\":\"order-1001-earn\"
  }"
```

Apply a redeem mutation:

```bash
curl -s http://127.0.0.1:3004/v1/loyalty/internal/ledger/apply \
  -H 'content-type: application/json' \
  -d "{
    \"userId\":\"${USER_ID}\",
    \"type\":\"REDEEM\",
    \"amountCents\":125,
    \"idempotencyKey\":\"order-1002-redeem\"
  }"
```

Read balance and ledger from gateway:

```bash
curl -s http://127.0.0.1:8080/v1/loyalty/balance -H "x-user-id: ${USER_ID}"
curl -s http://127.0.0.1:8080/v1/loyalty/ledger -H "x-user-id: ${USER_ID}"
```

Idempotency conflict check (same key, different payload):

```bash
curl -s http://127.0.0.1:3004/v1/loyalty/internal/ledger/apply \
  -H 'content-type: application/json' \
  -d "{
    \"userId\":\"${USER_ID}\",
    \"type\":\"EARN\",
    \"amountCents\":700,
    \"idempotencyKey\":\"order-1001-earn\"
  }"
```

Expected: `409` with `code = IDEMPOTENCY_KEY_REUSE`.
