# Clover Payment Integration Path

Last reviewed: `2026-03-11`

## Scope

M4.3 introduces Clover charge and refund paths across `orders` and `payments`:

- `payments`:
  - `POST /v1/payments/charges`
  - `POST /v1/payments/refunds`
- `orders`:
  - `POST /v1/orders/:orderId/pay` now calls payments charge endpoint
  - `POST /v1/orders/:orderId/cancel` triggers refund for paid orders

## Charge Outcomes

`payments` simulates Clover outcomes based on payment payload content:

- `applePayToken` includes `decline` -> `DECLINED`
- `applePayToken` includes `timeout` -> `TIMEOUT`
- if using structured `applePayWallet`, its `data` value is used for the same simulation rules
- any other signal -> `SUCCEEDED`

`orders` maps these outcomes to API behavior:

- `SUCCEEDED` -> order transitions to `PAID`
- `DECLINED` -> `402` with `PAYMENT_DECLINED`
- `TIMEOUT` -> `504` with `PAYMENT_TIMEOUT`

## Refund Outcomes

When canceling a `PAID` order:

1. orders submits a refund request to payments
2. if refund status is `REFUNDED`, order transitions to `CANCELED`
3. if refund status is `REJECTED`, orders returns `409` with `REFUND_REJECTED`

For dev simulation, a cancel reason containing `reject` returns a rejected refund.

## Idempotency

- Charges are idempotent in payments by `orderId:idempotencyKey`.
- Refunds are idempotent in payments by `orderId:idempotencyKey`.
- Orders keeps pay idempotency per `orderId:idempotencyKey` for paid responses.
- Orders refund requests use `cancel:<orderId>:<reasonHashPrefix>` so identical cancel retries are idempotent while failed refund attempts can be retried with changed cancellation context.

## Verification

```bash
pnpm --filter @gazelle/payments lint
pnpm --filter @gazelle/payments typecheck
pnpm --filter @gazelle/payments test
pnpm --filter @gazelle/orders lint
pnpm --filter @gazelle/orders typecheck
pnpm --filter @gazelle/orders test
```
