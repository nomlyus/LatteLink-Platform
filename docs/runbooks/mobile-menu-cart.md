# Mobile Menu + Cart Flow

Last reviewed: `2026-03-10`

## Scope

`apps/mobile` now supports:
- live menu browsing from `GET /v1/menu`
- item customization (size, milk, extra shot, notes)
- cart line-item state keyed by customization signature
- pricing summary with tax and estimated total from `GET /v1/store/config`

## Data Behavior

- Menu screen loads catalog via `src/menu/catalog.ts`.
- When live catalog data is unavailable or empty, the app falls back to an in-app starter menu.
- Store config failures fall back to default tax and pickup values so cart math still renders.

## Cart Math

Pricing and line merge behavior lives in `src/cart/model.ts`:
- unit price = base item price + customization delta
- line merge only occurs when menu item + customization signature match
- tax = `Math.round(subtotal * taxRateBasisPoints / 10000)`

## UX Notes

- Users can build and edit cart state without being authenticated.
- Checkout action remains gated by auth and currently shows a `Coming Soon` state after sign-in.
- Unauthenticated users are prompted to sign in from the cart summary.

## Verification

```bash
pnpm --filter @gazelle/mobile lint
pnpm --filter @gazelle/mobile typecheck
pnpm --filter @gazelle/mobile test
```
