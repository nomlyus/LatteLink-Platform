# Apple Pay Checkout (Mobile Dev Path)

Last reviewed: `2026-03-11`

## Scope

`apps/mobile` cart checkout now performs:
1. `POST /v1/orders/quote`
2. `POST /v1/orders`
3. `POST /v1/orders/:orderId/pay`

The flow is available for signed-in users from the cart screen.

## Current Token Collection Mode

- Apple Pay token is entered in the cart checkout form (`secureTextEntry`).
- A `Use Demo Token` shortcut generates a local testing token.
- Token value is trimmed and cleared from UI state when checkout is submitted.
- Orders and payments APIs now also accept a structured `applePayWallet` payload for native-sheet integration work.

This is a development integration path and does not yet invoke a native Apple Pay sheet.

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
- Use `Use Demo Token` or enter a token manually.
- Tap `Pay and Place Order`.

Expected result:
- Checkout status shows payment accepted with a pickup code.
- Cart items are cleared.

## Notes

- Quote items are currently aggregated by `menuItemId` before calling `/orders/quote`.
- Payment idempotency key is generated per checkout attempt in the mobile client.
