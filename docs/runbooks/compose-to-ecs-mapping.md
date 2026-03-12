# Compose -> ECS/Fargate Mapping Runbook

Last reviewed: `2026-03-11`

## Objective

Define migration parity from free-first Docker Compose deployment (`infra/free`) to AWS ECS/Fargate without changing service contracts.

## Service Mapping

- Compose service -> ECS service (one task definition per backend service)
- Compose image tag -> ECS task image tag (`image_tag` Terraform variable)
- Compose env vars -> ECS task environment + secrets
- Compose network -> VPC private subnets + security groups
- Compose edge (Caddy) -> ALB + listener rules

## Data Mapping

- Postgres (compose container) -> RDS PostgreSQL
- Valkey (compose container) -> ElastiCache Valkey/Redis-compatible deployment
- Backup files -> managed snapshots + periodic export retention policy

## Environment Contract (Parity Checklist)

Keep these identical between free-first and AWS:

- service image names and tags
- gateway upstream URLs and internal auth token model
- rate limit env vars and defaults
- health/readiness/metrics endpoints
- idempotency keys and reconciliation behavior

## Migration Sequence

1. Freeze release scope to one approved image tag.
2. Export free-first Postgres backup.
3. Restore backup into target RDS instance.
4. Apply Terraform for `staging` with same image tag.
5. Run smoke checks and API flow checks.
6. Run one-way shadow validation (read checks, no destructive writes).
7. Approve production cutover window.
8. Apply Terraform for `prod` with same image tag.
9. Validate health + critical flows.

## Cutover + Rollback Rules

- Cutover only if staging parity checks are green.
- Rollback to prior image tag via `rollback` workflow on first critical regression.
- Do not mutate schema during initial cutover unless rollback script supports downgrade safety.

## Verification Matrix

- auth: sign-in, refresh, sign-out
- catalog: menu + store config
- orders/payments: quote/create/pay/cancel + idempotent retries
- loyalty: balance + ledger
- notifications: push token upsert + outbox processing

## Exit Criteria

- Production traffic served from ECS/Fargate.
- SLO/alert baseline stable for 24h.
- Restore drill for RDS backup completed and documented.

