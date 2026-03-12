# Launch Readiness Checklist (M6.4)

Last reviewed: `2026-03-11`

## Objective

Define a repeatable go/no-go process before first production launch.

## Required Inputs

- Green required checks on `main` (`lint`, `typecheck`, `unit-tests`, `contract-tests`, `build`, `terraform-validate`, `codeql`, `dependency-review`, `secret-scan`)
- Successful `promote-staging` run for target image tag
- Staging smoke checks passing (`/health`, `/ready`, `/metrics`, `/v1/meta/contracts`)
- Product sign-off on critical flows:
  - auth sign-in + refresh + sign-out
  - menu -> cart -> checkout
  - order tracking/history
  - loyalty balance/ledger
- Incident contacts acknowledged (engineering + on-call)

## Go/No-Go Meeting

Record in release notes:

- Release image tag
- Approver names (engineering + product)
- Expected deployment window
- Rollback tag
- Known risks and mitigations

## Launch Steps

1. Trigger `promote-prod` with approved image tag.
2. Wait for workflow success.
3. Execute post-deploy smoke checks:
   - `GET /health`
   - `GET /ready`
   - `GET /metrics`
   - `GET /v1/meta/contracts`
4. Run production API sanity:
   - auth me endpoint via gateway
   - quote -> create -> pay idempotency path
   - loyalty read path
5. Confirm alerts are healthy and no sustained 5xx spikes.

## Rollback Trigger Criteria

- Smoke check failure after promotion
- Critical checkout/auth regression
- Sustained elevated 5xx or timeout rate over 10 minutes

If triggered, execute:

1. Run `rollback` workflow with previous known-good `image_tag`.
2. Re-run smoke checks.
3. Document incident timeline and follow-up actions.

## Exit Criteria

- Launch marked successful by engineering + product approvers
- Rollback tag for this launch archived in release notes
- Post-launch review ticket created for next hardening cycle

