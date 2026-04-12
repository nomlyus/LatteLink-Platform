# Payment Retry and Failure Recovery Coverage

Last reviewed: `2026-03-10`

## Scope

M4.4 adds end-to-end payment-path coverage across real `orders -> payments` calls for:

- retry behavior after timeout and decline outcomes
- idempotency behavior for repeated successful payment keys
- failure recovery when a refund is rejected during order cancellation

## E2E Test Coverage

Implemented in:
- `services/orders/test/payments-e2e.test.ts`

Scenarios:

1. timeout retry + recovery:
   - first pay attempt returns `PAYMENT_TIMEOUT`
   - repeated request with same key remains timeout-idempotent
   - retry with a new key and valid token succeeds

2. decline retry + recovery:
   - first pay attempt returns `PAYMENT_DECLINED`
   - retry with a new key and valid token succeeds

3. successful payment idempotency:
   - repeated payment with same idempotency key returns the same paid state without timeline duplication

4. refund failure recovery:
   - first cancel of a paid order may return `REFUND_REJECTED`
   - order remains `PAID`
   - retry cancel with a new refund idempotency fingerprint succeeds and transitions to `CANCELED`

## Implementation Notes

- Refund idempotency keys now include a reason fingerprint in orders:
  - `cancel:<orderId>:<reasonHashPrefix>`
- This preserves idempotency for identical retry inputs while allowing recovery when cancellation context changes.

## Verification

```bash
pnpm --filter @lattelink/orders lint
pnpm --filter @lattelink/orders typecheck
pnpm --filter @lattelink/orders test
pnpm --filter @lattelink/payments lint
pnpm --filter @lattelink/payments typecheck
pnpm --filter @lattelink/payments test
```
