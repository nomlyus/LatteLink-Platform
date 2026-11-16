# Launch Readiness Checklist

Last reviewed: `2026-04-04`

Use [development-flow.md](development-flow.md) for the release and rollback rules. Use [merchant-onboarding-pilot.md](merchant-onboarding-pilot.md) for the full merchant onboarding sequence. Use [pilot-incident-response.md](pilot-incident-response.md) if any launch or live support check fails.

This checklist only covers launch go/no-go validation.

## Required Inputs

- Green required checks on `main`
- Successful automatic deploy from the latest `main` commit
- Smoke checks passing against the live environment
- Product sign-off on critical flows:
  - auth sign-in + refresh + sign-out
  - menu -> cart -> checkout
  - order tracking/history
  - loyalty balance/ledger if enabled
- Incident contacts acknowledged

## Go / No-Go Record

Record in launch notes:

- release commit SHA
- deployed image SHA
- approver names
- deployment timestamp
- rollback SHA
- known risks and mitigations

## Launch Steps

1. Push the approved release commit directly to `main`.
2. Wait for image publish and automatic deploy to complete.
3. Execute post-deploy smoke checks.
4. Run production API sanity checks.
5. Confirm alerts are healthy and no sustained 5xx spikes.

## Rollback Trigger Criteria

- smoke check failure after deploy
- critical checkout or auth regression
- sustained elevated 5xx or timeout rate

If triggered:

1. Run `deploy-free` manually with the previous known-good git SHA.
2. Re-run smoke checks.
3. Document the incident timeline and follow-up actions.

## Exit Criteria

- launch marked successful by engineering and product
- rollback SHA recorded
- follow-up issues created for any gaps that remain
