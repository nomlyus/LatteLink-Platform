# Rollback Drill + Database Integrity Validation

Last reviewed: `2026-04-03`

This runbook validates rollback using the manual `deploy-free` workflow dispatch path described in [development-flow.md](development-flow.md).

## Objective

Validate that redeploying a prior full-SHA image restores service health without corrupting order, payment, loyalty, or notification data.

## Preconditions

- a known-good prior git SHA is available
- the live environment is reachable
- the `deploy-free` workflow can be run manually from `main`

## Drill Procedure

1. Capture pre-rollback baseline:
   - `GET /health`
   - `GET /ready`
   - `GET /metrics`
   - one sample order id + payment id + loyalty balance for a test user
2. Trigger GitHub `deploy-free` manually with:
   - `image_tag=<previous-known-good-git-sha>`
3. Confirm deploy success and smoke checks.
4. Re-run baseline checks and compare values.

## Data Integrity Checks

Use known test user/order IDs and verify:

- Orders remain coherent
- Payments remain present and idempotent
- Loyalty remains consistent
- Notifications continue without duplicate floods

## Pass Criteria

- manual redeploy completes successfully
- `/health`, `/ready`, `/metrics`, and `/v1/meta/contracts` are healthy
- no missing or duplicated critical records
- no elevated 5xx or timeout trend after rollback stabilization

## If Drill Fails

1. Stop rollout activities.
2. Preserve logs and affected entity IDs.
3. Open follow-up issues with the failing assertions.
4. Keep the environment pinned to the last known-good deployment until remediation is complete.
