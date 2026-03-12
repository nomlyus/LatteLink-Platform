# Rollback Drill + Database Integrity Validation

Last reviewed: `2026-03-11`

## Objective

Validate that application rollback to a prior image tag restores service health without corrupting order, payment, loyalty, or notification data.

## Preconditions

- Known-good prior image tag is available in GHCR.
- Current environment has reachable `API_BASE_URL_<ENV>`.
- `rollback` workflow permissions and secrets are configured.

## Drill Procedure

1. Select environment (`staging` first, then `prod`).
2. Capture pre-rollback baseline:
   - `GET /health`
   - `GET /ready`
   - `GET /metrics`
   - one sample order id + payment id + loyalty balance for a test user
3. Trigger GitHub `rollback` workflow with:
   - `environment`
   - previous stable `image_tag`
4. Confirm rollback workflow success and smoke checks.
5. Re-run baseline checks and compare values.

## Data Integrity Checks

Use known test user/order IDs and verify:

- Orders:
  - status progression remains valid (no invalid transitions)
  - order totals unchanged for already-paid orders
- Payments:
  - charge/refund records remain present
  - idempotency behavior still returns same response for same key
- Loyalty:
  - balance and ledger remain consistent with paid/canceled order history
- Notifications:
  - outbox processing continues; no duplicate dispatch flood on replay

## Pass Criteria

- Rollback workflow completes successfully.
- `/health`, `/ready`, `/metrics` and `/v1/meta/contracts` are healthy.
- No missing or duplicated critical records in orders/payments/loyalty.
- No elevated 5xx/timeout trend after rollback stabilization window.

## If Drill Fails

1. Stop rollout activities.
2. Preserve logs, workflow run links, and affected entity IDs.
3. Open incident + bug ticket with:
   - environment
   - attempted rollback tag
   - failing integrity assertions
4. Keep environment pinned to last known-good deployment until remediation is complete.

