# Final 25 Percent Plan

Last updated: `2026-03-20`

## Mission

Complete the remaining production-readiness slice that turns the current polished product into a sellable, operational platform without breaking existing mobile flows or current public API behavior.

## Current Repo Seams

Primary implementation surfaces already in place:

- `packages/contracts/orders/src/index.ts`
- `packages/contracts/catalog/src/index.ts`
- `packages/sdk-mobile/src/index.ts`
- `packages/persistence/src/index.ts`
- `services/orders/src/routes.ts`
- `services/orders/src/fulfillment.ts`
- `services/orders/src/repository.ts`
- `services/payments/src/routes.ts`
- `services/catalog/src/routes.ts`
- `services/catalog/src/repository.ts`
- `services/gateway/src/routes.ts`
- `services/gateway/test/gateway.test.ts`
- `apps/mobile/src/api/client.ts`
- `apps/mobile/src/menu/catalog.ts`
- `apps/mobile/src/orders/checkout.ts`
- `apps/mobile/src/orders/history.ts`
- `apps/mobile/app/(tabs)/orders.tsx`
- `apps/mobile/app/cart.tsx`

There is no pre-existing admin web surface. The chosen MVP path is:

- operator/admin APIs in backend services
- a lightweight internal client dashboard under `apps/client-dashboard`
- no staff UI mixed into the Expo customer app

## Shared Contracts That Need Coordination

These boundaries must stay synchronized across all workstreams:

1. Order state model
   - `packages/contracts/orders/src/index.ts`
   - `services/orders/src/fulfillment.ts`
   - `services/orders/src/routes.ts`
   - mobile order status/timeline consumers
2. Order timeline/event schema
   - current timeline is append-only and customer-facing
   - likely additive extension: event source attribution and optional metadata
3. Payment finalization assumptions
   - `services/orders/src/routes.ts`
   - `services/payments/src/routes.ts`
   - e2e coverage under `services/orders/test` and `services/payments/test`
4. App/store/platform config schema
   - `packages/contracts/catalog/src/index.ts` may expand
   - `services/catalog/src/repository.ts`
   - `services/gateway/src/routes.ts`
   - `packages/sdk-mobile/src/index.ts`
   - `apps/mobile`
5. Admin/operator routes
   - must reuse backend business logic rather than duplicating transition rules in UI
6. Tenant identifiers
   - additive `brandId` and `locationId` support through contracts, persistence, and config surfaces

## Workstream Ownership

### Agent A: Order Lifecycle + Notifications

Primary ownership:

- `packages/contracts/orders/src/index.ts`
- `services/orders/src/fulfillment.ts`
- `services/orders/src/routes.ts`
- `services/orders/test/fulfillment.test.ts`
- `services/orders/test/orders.test.ts`
- `docs/order-lifecycle.md`

Expected scope:

- replace inline status mutation logic with reusable validated transition helpers
- keep both staff-driven and time-based fulfillment modes behind explicit shared configuration
- add idempotent transition handling with append-once timeline behavior
- add notification hook coverage for `PAID`, `IN_PREP`, `READY`

### Agent B: Payments Hardening + Checkout/Order Finalization

Primary ownership:

- `services/payments/src/routes.ts`
- `services/payments/test/health.test.ts`
- `services/orders/test/payments-e2e.test.ts`
- `docs/payment-order-flow.md`

Shared-read only:

- `services/orders/src/routes.ts`

Expected scope:

- harden charge/refund/webhook idempotency
- ensure retries do not duplicate final state or core side effects
- verify customer-visible order availability after payment
- document the production sequence and operational setup

### Agent C: Admin/Staff Dashboard MVP

Primary ownership:

- backend admin/operator APIs in `services/orders`, `services/catalog`, and `services/gateway`
- new internal client dashboard app in `apps/client-dashboard`
- operator-specific tests
- `docs/operator-dashboard.md`

Guardrails:

- do not reimplement business rules client-side
- staff actions must call authoritative backend transition endpoints
- menu/store edits must use backend contracts

### Agent D: Platform Config + Tenant Foundations + Integration Sweep

Primary ownership:

- `packages/contracts/catalog/src/index.ts`
- `packages/contracts/core/src/index.ts` if shared config types belong there
- `packages/persistence/src/index.ts`
- `services/catalog/src/repository.ts`
- `services/catalog/src/routes.ts`
- `services/gateway/src/routes.ts`
- `packages/sdk-mobile/src/index.ts`
- `apps/mobile/src/api/client.ts`
- relevant mobile config consumers under `apps/mobile`
- `docs/platform-config.md`

Expected scope:

- additive brand/location foundations
- `GET /v1/app-config`
- move safe hardcoded brand assumptions toward runtime config
- keep backward compatibility for current store/menu flows

### Agent E: Safety, Testing, and Documentation Integration

Primary ownership:

- cross-workstream review
- missing tests across services and mobile state layers
- docs integration and changelog/reporting
- final verification pass

Expected files:

- `docs/changelog/final-25-percent-phase-1.md`
- `docs/implementation/final-25-percent-report.md`
- test files touched across all services as needed

## Initial File Targets By Area

### Order Reality

- `packages/contracts/orders/src/index.ts`
- `services/orders/src/fulfillment.ts`
- `services/orders/src/routes.ts`
- `services/orders/src/repository.ts`
- `services/orders/test/fulfillment.test.ts`
- `services/orders/test/orders.test.ts`

### Money Flow

- `services/payments/src/routes.ts`
- `services/payments/test/health.test.ts`
- `services/orders/test/payments-e2e.test.ts`
- `services/orders/src/routes.ts`

### Operator Side

- `services/orders/src/routes.ts`
- `services/catalog/src/routes.ts`
- `services/catalog/src/repository.ts`
- `services/gateway/src/routes.ts`
- `apps/client-dashboard`
- related gateway/order/catalog tests

### Platform Layer

- `packages/contracts/catalog/src/index.ts`
- `packages/persistence/src/index.ts`
- `services/catalog/src/repository.ts`
- `services/catalog/src/routes.ts`
- `services/gateway/src/routes.ts`
- `packages/sdk-mobile/src/index.ts`
- `apps/mobile/src/api/client.ts`
- `apps/mobile/src/menu/catalog.ts`
- `apps/mobile/app/(tabs)/home.tsx`
- `apps/mobile/app/cart.tsx`
- `apps/mobile/src/orders/applePay.ts`

## Coordination Rules

1. Any change to order status or timeline schema must be additive or fully propagated to:
   - contracts
   - orders service
   - gateway tests
   - mobile consumers
2. Staff/operator actions must call the same backend transition helpers used by payment reconciliation.
3. Payment retries and webhooks must remain safe under duplicate delivery.
4. New tenant/config fields must default cleanly for the current flagship brand.
5. Tests are required for every meaningful backend/stateful change.

## Implementation Sequence

1. Lock shared contract direction locally.
2. Run Agents A-D in parallel on disjoint write scopes as much as possible.
3. Have Agent E review branch state, add missing coverage, and reconcile docs.
4. Integrate shared changes locally where routes/tests overlap.
5. Run targeted verification, then broader repo verification.
6. Publish final implementation report and changelog entry.

## Risks To Watch

- duplicate order/timeline writes across pay + webhook reconciliation flows
- accidental breakage of existing mobile order polling/refresh behavior
- overextending platform foundations into destructive schema changes
- admin surface duplicating catalog/order business rules instead of calling backend
- contract drift between gateway proxies, SDK methods, and mobile consumers
