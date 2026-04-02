# Production Button-Up Checklist

Last updated: `2026-03-11`

## Phase 0: Unblockers

- [x] Remove workflow-evaluation blockers from `deploy-dev` and `release`.
- [x] Create production prerequisite checklist for Apple/Clover/domain readiness.
- [x] Refresh stale milestones and release runbook docs.

## Phase 1: Foundation Hardening

- [x] Gateway `/v1/menu` and `/v1/store/config` now proxy catalog service.
- [x] Local dev scripts pass `CATALOG_SERVICE_BASE_URL`.
- [x] `GET /metrics` + request logging parity in identity/catalog/payments/loyalty.
- [x] Introduce shared persistence bootstrap package (`@gazelle/persistence`) and Postgres table provisioning.
- [x] Move `payments` idempotency storage to repository-backed persistence with Postgres + in-memory fallback.
- [x] Move `loyalty` state to DB-backed repositories with Postgres + in-memory fallback.
- [x] Move `orders` state to DB-backed repositories.
- [x] Move `identity` session/challenge state to DB-backed repositories.
- [x] Add outbox-backed notification dispatch.

## Phase 2: Real Auth + Passkeys

- [x] Tighten passkey verify contract from `record(unknown)` to explicit credential payload.
- [x] Implement WebAuthn challenge/verify with real credential persistence.
- [x] Integrate mobile passkeys on device (custom dev client path).
- [x] Replace Apple identity-token manual input with native Apple auth.

## Phase 3: Real Apple Pay + Clover

- [x] Implement native Apple Pay sheet and wallet token handling.
- [x] Implement real Clover sandbox charge/refund with webhook reconciliation.
- [x] Persist payment states and webhook events.

## Phase 4: UI/UX Production Baseline

- [x] Build production account, history, loyalty, and notification settings surfaces.
- [x] Complete loading/error/offline/retry states across auth/cart/checkout/order tracking.
- [x] Accessibility completion pass (dynamic type, labels, contrast, safe areas).

## Phase 5: Free-First Deployment

- [x] Add free deployment workflow scaffold (`deploy-free`).
- [x] Add DigitalOcean/Compose deployment bundle under `infra/free`.
- [x] Add free-first deployment runbook and required secrets/vars checklist.
- [x] Split the client dashboard into its own Vercel deployment lane.
- [ ] Provision droplet/domain/secrets and execute first successful remote deploy.

## Phase 6: AWS Cutover

- [x] Create compose -> ECS mapping runbook.
- [x] Implement cutover + rollback rehearsal.
