# Orders Lifecycle and Idempotency

Last reviewed: `2026-03-10`

## Scope

`services/orders` now implements:
- `POST /v1/orders/quote`
- `POST /v1/orders`
- `POST /v1/orders/:orderId/pay`
- `GET /v1/orders`
- `GET /v1/orders/:orderId`
- `POST /v1/orders/:orderId/cancel`

## Lifecycle

Default in-memory flow:

1. Quote is created with computed subtotal/discount/tax/total and a `quoteHash`.
2. Order is created from `quoteId + quoteHash` in `PENDING_PAYMENT`.
3. Payment transitions order to `PAID`.
4. Cancel transitions order to `CANCELED` (unless already canceled/completed).
5. `timeline` is appended on lifecycle transitions.

## Loyalty Integration (M5.2)

`services/orders` now orchestrates loyalty ledger mutations through:
- `POST /v1/loyalty/internal/ledger/apply`

`services/orders` sends `LOYALTY_INTERNAL_API_TOKEN` as `x-internal-token` on those loyalty requests.

Payment success (`PAID`) applies:
- `REDEEM` for `quote.pointsToRedeem` (when > 0)
- `EARN` for `order.total.amountCents`

Paid cancellation with successful refund applies:
- `ADJUSTMENT` to reverse earned points (`-order.total.amountCents`)
- `REFUND` to restore redeemed points (`quote.pointsToRedeem`, when > 0)

Loyalty mutation idempotency keys are deterministic per order:
- `order:{orderId}:loyalty:redeem`
- `order:{orderId}:loyalty:earn`
- `order:{orderId}:loyalty:reverse-earn`
- `order:{orderId}:loyalty:refund-redeem`

## Notifications Integration (M5.3)

`services/orders` now emits best-effort internal notification events to:
- `POST /v1/notifications/internal/order-state`

`services/orders` sends `NOTIFICATIONS_INTERNAL_API_TOKEN` as `x-internal-token` on those notifications requests.

Events are emitted when status transitions are newly applied:
- `PENDING_PAYMENT` (order create)
- `PAID` (successful payment)
- `CANCELED` (successful cancel)

Notification emission is non-blocking for order APIs:
- notification failures are logged with request context
- order lifecycle responses still succeed when notifications are unavailable

Default notifications upstream:
- `NOTIFICATIONS_SERVICE_BASE_URL=http://127.0.0.1:3005`

## Idempotency Controls

- Create idempotency key:
  - derived from `quoteId:quoteHash`
  - repeated creates for the same pair return the same order
- Payment idempotency key:
  - derived from `orderId:idempotencyKey`
  - repeated payments with the same key return the same paid response

## Payment Recovery Rules

- `DECLINED`
  - order remains `PENDING_PAYMENT`
  - customer can retry with a new payment idempotency key
- `TIMEOUT`
  - order remains `PENDING_PAYMENT`
  - the last Clover charge snapshot is persisted on the order
  - new payment attempts are blocked with `PAYMENT_RECONCILIATION_PENDING`
  - only two exits are allowed:
    - Clover reconciliation webhook settles the charge
    - support confirms the charge did not settle and explicitly clears the path operationally before another checkout attempt
- `REFUND_REJECTED`
  - order remains in its pre-cancel state
  - the rejected refund snapshot is persisted for support follow-up
- late `REFUND` webhook after `COMPLETED`
  - accepted as a no-op
  - order does not auto-transition out of `COMPLETED`
  - support must review the refund separately

## Gateway Routing

`services/gateway` order routes now proxy to the orders service (`ORDERS_SERVICE_BASE_URL`).

Default:
- `ORDERS_SERVICE_BASE_URL=http://127.0.0.1:3001`
- `LOYALTY_SERVICE_BASE_URL=http://127.0.0.1:3004` (used by orders internally)
- `LOYALTY_INTERNAL_API_TOKEN` must match the loyalty service runtime
- `NOTIFICATIONS_SERVICE_BASE_URL=http://127.0.0.1:3005`
- `NOTIFICATIONS_INTERNAL_API_TOKEN` must match the notifications service runtime

## Verification

```bash
pnpm --filter @gazelle/orders lint
pnpm --filter @gazelle/orders typecheck
pnpm --filter @gazelle/orders test
pnpm --filter @gazelle/gateway lint
pnpm --filter @gazelle/gateway typecheck
pnpm --filter @gazelle/gateway test
```
