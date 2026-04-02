# Apple Pay Checkout (Mobile Dev Path)

Last reviewed: `2026-03-11`

## Scope

`apps/mobile` cart checkout now performs:
1. `POST /v1/orders/quote`
2. `POST /v1/orders`
3. `POST /v1/orders/:orderId/pay`

The flow is available for signed-in users from the cart screen.

## Current Token Collection Mode

- Cart now attempts a native Apple Pay sheet on iOS when `PaymentRequest` Apple Pay support is available.
- A `Use Demo Token` shortcut generates a local testing token.
- Fallback token mode remains in cart for local simulation and manual testing.
- Orders and payments APIs now also accept a structured `applePayWallet` payload for native-sheet integration work.

Native Apple Pay still depends on entitlements/certificates and does not fully replace manual fallback mode in local development.

## Local Verification

1. Start local APIs:
```bash
pnpm dev:services
```
or LAN mode:
```bash
pnpm dev:services:lan
```

2. Start mobile app:
```bash
pnpm dev:mobile:local
```
or LAN mode:
```bash
pnpm dev:mobile:lan
```

3. In app:
- Sign in from `Auth` screen.
- Add items in `Menu`.
- Open `Cart`.
- If available, tap `Pay with Apple Pay`.
- If unavailable, use `Use Demo Token` or enter a token manually and tap `Pay with Token Fallback`.

Expected result:
- Checkout status shows payment accepted with a pickup code.
- Cart items are cleared.

## Notes

- Quote items are currently aggregated by `menuItemId` before calling `/orders/quote`.
- Payment idempotency key is generated per checkout attempt in the mobile client.
- If checkout returns `PAYMENT_TIMEOUT`, the order remains pending and the client should not silently retry with a fresh idempotency key. The payment must be reconciled first.
