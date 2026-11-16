# Order Lifecycle

Last updated: `2026-03-20`

## Canonical Model

The canonical order state is still:

- `order.status`
- `order.timeline`

`order.timeline` is append-only. Every meaningful state change should add one new timeline entry and leave prior entries untouched.

## Supported Statuses

Current status values:

- `PENDING_PAYMENT`
- `PAID`
- `IN_PREP`
- `READY`
- `COMPLETED`
- `CANCELED`

`COMPLETED` and `CANCELED` are terminal.

## Valid Transitions

The authoritative one-step lifecycle is:

- `PENDING_PAYMENT -> PAID`
- `PAID -> IN_PREP`
- `IN_PREP -> READY`
- `READY -> COMPLETED`

`CANCELED` is allowed from non-terminal states, but once an order is `CANCELED` it must not advance again.

Invalid regressions are rejected. Skipping ahead multiple states in a single direct transition is also rejected; callers that need to advance through multiple states must do so stepwise through the shared lifecycle helper.

## Shared Helpers

The orders service now uses reusable transition helpers in:

- [`services/orders/src/lifecycle.ts`](../services/orders/src/lifecycle.ts)

Important helpers:

- `transitionOrderStatus(order, nextStatus, metadata)`
- `advanceOrderLifecycleToStatus(order, targetStatus, options)`
- `createOrderTimelineEntry(...)`

These helpers:

- validate the requested transition
- reject invalid regressions
- preserve idempotency when the requested status already matches the current status
- append exactly one timeline entry for each successful step
- support optional source attribution on timeline entries

## Timeline Attribution

Timeline entries may include an optional `source` field:

- `system`
- `staff`
- `webhook`
- `customer`

This field is additive and backward compatible. Existing consumers can ignore it.

## Notification Hooks

Order state notifications are emitted on the real transition path for:

- `PAID`
- `IN_PREP`
- `READY`

Customer cancel flows also continue to emit the existing cancellation notification path.

## Configured Fulfillment Modes

Order progression now supports two runtime modes:

- `staff`
- `time_based`

The current time-based reconciler lives in:

- [`services/orders/src/fulfillment.ts`](../services/orders/src/fulfillment.ts)

Behavior by mode:

- `staff`: reads do not auto-advance orders. Staff or trusted internal writers must move orders from `PAID` to `IN_PREP`, `READY`, and `COMPLETED`.
- `time_based`: reads can advance orders based on elapsed time from the `PAID` event using the current schedule of `5 -> IN_PREP`, `10 -> READY`, and `15 -> COMPLETED` minutes.

The active mode is surfaced in runtime app-config so clients and operator tooling can see which fulfillment model is active.

## Staff API

The orders service exposes an internal staff-facing transition endpoint:

- `POST /v1/orders/:orderId/status`

It uses the same lifecycle helper, so staff actions and payment/webhook-driven state changes stay aligned.
The staff transition endpoint and staff-sourced cancel path are only enabled when fulfillment mode is `staff`; in `time_based` mode they reject manual progression requests.

## Operational Notes

- Customer payment still transitions `PENDING_PAYMENT -> PAID`.
- Customer cancel continues to refund paid orders before transitioning to `CANCELED`.
- `time_based` mode never advances terminal states.
- `staff` mode keeps reads side-effect free for fulfillment progression.
- The shared helper layer is the source of truth for validation and idempotency.
