# Final 25 Percent Report

Last updated: `2026-03-20`

## Goals

Execute the production-readiness slice that turns the current polished product into an operational platform:

- real order lifecycle handling
- reliable payment-to-order finalization
- first operator surface
- runtime config and tenant-aware foundations

## Approach

The work stayed additive and contract-conscious:

- order lifecycle mutations were centralized instead of rewritten inline
- payment retries and webhook finalization were hardened around idempotency
- operator actions were exposed through gateway-backed admin routes
- the staff UI was moved into a dedicated browser app instead of the Expo app
- brand/runtime config was added as a backend contract and consumed by clients with safe fallback behavior

## Major Change Areas

### Order Reality

- `services/orders/src/lifecycle.ts`
- `services/orders/src/routes.ts`
- `services/orders/src/fulfillment.ts`
- `packages/contracts/orders/src/index.ts`

Result:

- canonical validated transitions for `PAID -> IN_PREP -> READY -> COMPLETED`
- append-only timeline behavior with optional `source`
- idempotent no-op when the requested status already matches
- invalid regressions rejected
- staff cancellation attribution supported when routed through the gateway
- runtime fulfillment mode is now explicit: `staff` or `time_based`

### Money Flow

- `services/payments/src/routes.ts`
- `services/orders/test/payments-e2e.test.ts`
- `services/payments/test/health.test.ts`
- `docs/payment-order-flow.md`

Result:

- safer charge/refund idempotency
- replay-safe reconciliation behavior
- clearer documented Clover operational expectations

### Operator Side

- `apps/client-dashboard/*`
- `services/gateway/src/routes.ts`
- `services/gateway/test/gateway.test.ts`
- `services/catalog/src/routes.ts`
- `services/catalog/src/repository.ts`
- `docs/operator-dashboard.md`

Result:

- internal browser-based operator console
- active order list and order detail
- staff actions for prep, ready, complete, and cancel
- menu editing and store-config editing backed by real admin routes

### Platform Layer

- `packages/contracts/catalog/src/index.ts`
- `packages/persistence/src/index.ts`
- `services/catalog/src/tenant.ts`
- `services/catalog/src/routes.ts`
- `services/catalog/src/repository.ts`
- `services/gateway/openapi/openapi.json`
- `packages/sdk-mobile/src/generated/types.ts`
- `docs/platform-config.md`

Result:

- additive `brand_id` and `location_id` schema direction
- dedicated app-config payload for brand, theme, feature flags, tabs, loyalty, payment capability visibility, and fulfillment mode
- gateway proxy and generated artifacts updated to match

## Files Changed

High-signal file groups:

- order lifecycle and tests:
  - `packages/contracts/orders/src/index.ts`
  - `services/orders/src/lifecycle.ts`
  - `services/orders/src/routes.ts`
  - `services/orders/src/fulfillment.ts`
  - `services/orders/test/fulfillment.test.ts`
  - `services/orders/test/orders.test.ts`
- payment hardening:
  - `services/payments/src/routes.ts`
  - `services/payments/test/health.test.ts`
  - `services/orders/test/payments-e2e.test.ts`
- catalog/admin/platform config:
  - `packages/contracts/catalog/src/index.ts`
  - `packages/contracts/catalog/test/catalog.test.ts`
  - `packages/persistence/src/index.ts`
  - `services/catalog/src/tenant.ts`
  - `services/catalog/src/repository.ts`
  - `services/catalog/src/routes.ts`
  - `services/catalog/test/health.test.ts`
- gateway/admin routing:
  - `services/gateway/src/routes.ts`
  - `services/gateway/test/gateway.test.ts`
  - `services/gateway/openapi/openapi.json`
- client consumption:
  - `apps/mobile/src/api/client.ts`
  - `apps/mobile/src/menu/catalog.ts`
  - `apps/mobile/app/(tabs)/home.tsx`
  - `apps/mobile/app/cart.tsx`
  - `apps/mobile/src/orders/applePay.ts`
  - `packages/sdk-mobile/src/index.ts`
  - `packages/sdk-mobile/src/generated/types.ts`
  - `packages/sdk-mobile/test/client.test.ts`
- client dashboard app:
  - `apps/client-dashboard/package.json`
  - `apps/client-dashboard/index.html`
  - `apps/client-dashboard/src/api.ts`
  - `apps/client-dashboard/src/main.ts`
  - `apps/client-dashboard/src/model.ts`
  - `apps/client-dashboard/src/storage.ts`
  - `apps/client-dashboard/src/styles.css`
  - `apps/client-dashboard/test/api.test.ts`
  - `apps/client-dashboard/test/model.test.ts`

## Verification

Completed:

- `pnpm --filter @lattelink/contracts-catalog test`
- `pnpm --filter @lattelink/catalog test`
- `pnpm --filter @lattelink/catalog typecheck`
- `pnpm --filter @lattelink/gateway test`
- `pnpm --filter @lattelink/gateway typecheck`
- `pnpm --filter @lattelink/orders exec vitest run test/fulfillment.test.ts test/orders.test.ts`
- `pnpm --filter @lattelink/payments test`
- `pnpm --filter @lattelink/sdk-mobile test`
- `pnpm --filter @lattelink/mobile test`
- `pnpm --filter @lattelink/mobile typecheck`
- `pnpm --filter @lattelink/client-dashboard test`
- `pnpm --filter @lattelink/client-dashboard typecheck`
- `pnpm --filter @lattelink/client-dashboard lint`
- `pnpm --filter @lattelink/client-dashboard build`
- `pnpm --filter @lattelink/gateway openapi`
- `pnpm --filter @lattelink/sdk-mobile generate`

Partially blocked:

- `pnpm --filter @lattelink/orders test`
  - the package-level run still includes `services/orders/test/payments-e2e.test.ts`
  - those tests fail in this environment with `listen EPERM: operation not permitted 127.0.0.1`
  - the narrowed non-socket orders suite passed

## Known Limitations

- operator auth is still a shared token model, not role-based operator auth
- time-based fulfillment is now a supported configurable mode, but its schedule is still a shared default rather than tenant-managed runtime config
- customer/order payloads still have limited operator-facing customer metadata
- tenant support is additive groundwork, not a full multi-tenant runtime rollout

## Follow-Up Roadmap

1. Move fulfillment mode and schedule from env/defaults into tenant-managed configuration when multi-client rollout begins.
2. Add real operator authentication, authorization, and audit roles.
3. Expand operator reporting and order search beyond the MVP view.
4. Move brand/location defaults into managed configuration for multiple clients.
5. Re-run the full orders payments e2e suite in an environment that allows local socket binding.
