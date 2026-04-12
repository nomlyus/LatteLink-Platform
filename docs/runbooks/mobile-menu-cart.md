# Mobile Menu + Cart Flow

Last reviewed: `2026-03-19`

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

## Loading + Navigation Behavior

- Menu initial load now keeps the loading overlay visible until the first set of item artwork resolves, then fades into the live menu surface instead of switching abruptly.
- Menu loading header spacing is intentionally aligned with the expanded live header so the skeleton and the live screen share the same top rhythm.
- The customize modal uses a skeleton sheet that matches the live modal outline, including hero image area, content blocks, summary rows, and footer controls.
- Customize modal initial reveal now fades the loading sheet over the live modal and waits for the hero image before clearing the overlay.
- The Orders tab no longer shows a separate active-order dot in the tab bar. Active order state is communicated inside the Orders screen itself.

## Verification

```bash
pnpm --filter @lattelink/mobile lint
pnpm --filter @lattelink/mobile typecheck
pnpm --filter @lattelink/mobile test
```
