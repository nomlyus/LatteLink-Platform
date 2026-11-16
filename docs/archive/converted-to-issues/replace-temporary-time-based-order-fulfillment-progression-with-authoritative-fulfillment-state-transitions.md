# Replace temporary time-based order fulfillment progression with authoritative fulfillment state transitions

> Update 2026-03-20: product direction changed. Time-based fulfillment is now a supported configurable mode alongside staff-driven fulfillment. The remaining gap is not forced removal of time-based mode; it is adding richer authoritative writers, better auth/audit controls, and tenant-managed fulfillment configuration.

## Problem

The mobile active-order experience already supports the lifecycle:

- `PENDING_PAYMENT`
- `PAID`
- `IN_PREP`
- `READY`
- `COMPLETED`
- `CANCELED`

The backend `services/orders` service currently writes `PENDING_PAYMENT`, `PAID`, and `CANCELED`, but does not yet have authoritative writers for post-payment fulfillment states like `IN_PREP`, `READY`, and `COMPLETED`. As a result, successfully paid orders can remain stuck in `PAID` indefinitely even though the client is prepared to render richer fulfillment progress.

## Current stopgap

A temporary time-based reconciliation has been added in the orders service read paths:

- after `5` minutes from the `PAID` timestamp, advance to `IN_PREP`
- after `10` minutes total from the `PAID` timestamp, advance to `READY`
- after `15` minutes total from the `PAID` timestamp, advance to `COMPLETED`

The stopgap:

- derives progression from persisted timestamps instead of in-memory timers
- reconciles lazily on order read/list fetches
- appends timeline entries exactly once
- only applies forward transitions
- never advances `PENDING_PAYMENT`, `CANCELED`, or already-`COMPLETED` orders

## Why stopgap must be removed

This implementation is only a UX unblocker. It is not a production-grade source of truth because:

- elapsed time is not the same thing as actual staff or kitchen progress
- orders can become `READY` or `COMPLETED` without any real-world fulfillment action
- reads mutate order state, which is acceptable as a stopgap but not a durable architecture
- notification timing can drift from the real operational workflow
- audit trails become ambiguous because transitions are inferred instead of authored by the real actor or system
- the progression cannot represent exceptions such as partial delays, manual holds, remake flows, or fulfillment reversals

## Proposed target design

Replace the temporary reconciliation with authoritative fulfillment-state writers that are triggered by real operational events.

Target design principles:

- `services/orders` remains the canonical owner of persisted `order.status` and `order.timeline`
- fulfillment transitions are written by explicit service commands or trusted upstream events
- every transition has an actor or source, timestamp, and audit-friendly note/context
- notifications are dispatched from authoritative transitions, not inferred reads
- mobile and staff/admin clients consume the same canonical lifecycle

## Valid lifecycle and transition rules

Primary lifecycle:

- `PENDING_PAYMENT -> PAID`
- `PAID -> IN_PREP`
- `IN_PREP -> READY`
- `READY -> COMPLETED`

Terminal paths:

- `PENDING_PAYMENT -> CANCELED`
- `PAID -> CANCELED`
- `IN_PREP -> CANCELED` only if operationally supported and refund/exception behavior is defined
- `READY -> CANCELED` only if operationally supported and refund/exception behavior is defined

Rules:

- transitions must be forward-only unless an explicit exception workflow is defined
- terminal states must never auto-advance
- duplicate writes must be idempotent
- timeline entries must be appended exactly once per accepted transition
- status and timeline must stay in sync

## Possible authoritative writers

Potential authoritative sources for fulfillment transitions:

- staff/admin UI actions such as `Start prep`, `Mark ready`, and `Complete pickup`
- POS-originated webhooks or polling reconciliation if the POS owns preparation state
- kitchen display system or bar workflow events
- store-ops tooling used by staff at pickup handoff

Expected source priority:

- direct staff action or POS webhook should win over inferred timing
- if multiple sources exist, one service must normalize them into valid order transitions before persistence

## Data model considerations

Current order timeline entries are sufficient for the stopgap but likely need enrichment for the real solution.

Consider adding or formalizing:

- actor/source metadata on timeline entries
- explicit fulfillment timestamps if needed for analytics and SLAs
- transition reason / note taxonomy
- idempotency keys for fulfillment writers
- optional operational metadata such as station, device, or staff identifier

## API / service changes

Likely backend work:

- add internal or staff-scoped fulfillment transition endpoints in `services/orders`
- add authorization rules for staff/admin fulfillment writers
- add webhook handlers or reconciliation endpoints for POS-originated fulfillment updates
- keep transition validation centralized in one service-layer function
- emit notification events from authoritative transition writes
- update OpenAPI/contracts for any new fulfillment commands or staff/admin read models

## Testing requirements

Required testing for the real implementation:

- valid forward transitions only
- invalid transitions rejected with clear errors
- idempotent repeated writes
- terminal-state protection
- audit/timeline correctness
- notification dispatch per accepted transition
- webhook replay safety
- concurrent writer safety
- observability coverage for rejected, delayed, and successful transitions

## Notification implications

Notifications should be emitted only when an authoritative transition is accepted, with deduplication keyed by:

- `orderId`
- `status`
- authoritative event or command idempotency key

Push copy and downstream consumers should never have to infer whether a fulfillment update was real or time-simulated.

## Observability / auditability

The real implementation should provide:

- structured logs for every attempted fulfillment transition
- source attribution for each accepted transition
- metrics for transition latency by state
- alerts for invalid transition attempts or stuck orders
- traceable audit history for refunds, cancellations, and fulfillment completion

## Acceptance criteria

- no order fulfillment state is advanced by elapsed-time heuristics
- `PAID -> IN_PREP -> READY -> COMPLETED` is driven only by authoritative inputs
- invalid or out-of-order transitions are rejected
- status and timeline remain synchronized for every accepted transition
- idempotent replays do not duplicate timeline entries
- push/order-state notifications are emitted from accepted fulfillment transitions
- observability covers transition success, rejection, replay, and latency
- mobile active-order experience works from canonical backend states with no temporary reconciliation on reads
