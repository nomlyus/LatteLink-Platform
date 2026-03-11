# Observability and Security Regression Runbook

Last reviewed: `2026-03-11`

## Purpose

Validate M5.4 hardening controls across critical service paths:
- request-level observability (`x-request-id`, structured completion logs, in-process metrics)
- CloudWatch alarm coverage for ECS health signals
- security regression checks for auth/user-context validation

## Service Observability Baseline

Critical services expose:
- `GET /health`
- `GET /ready`
- `GET /metrics`

`/metrics` returns:
- service name
- uptime in seconds
- request counters by status class (`2xx`, `4xx`, `5xx`)

## Local Validation

Start stack:

```bash
pnpm dev:services
```

Check metrics endpoints:

```bash
curl -s http://127.0.0.1:8080/metrics
curl -s http://127.0.0.1:3000/metrics
curl -s http://127.0.0.1:3002/metrics
curl -s http://127.0.0.1:3001/metrics
curl -s http://127.0.0.1:3003/metrics
curl -s http://127.0.0.1:3004/metrics
curl -s http://127.0.0.1:3005/metrics
```

Trace a request through gateway:

```bash
curl -s http://127.0.0.1:8080/v1/orders/quote \
  -H 'content-type: application/json' \
  -H 'x-request-id: runbook-trace-001' \
  -d '{"locationId":"flagship-01","items":[{"itemId":"latte","quantity":1}],"pointsToRedeem":0}'
```

Expected:
- response includes `x-request-id: runbook-trace-001`
- gateway logs contain request completion with method/url/status/responseTime

## Security Regression Checks

Run focused tests:

```bash
pnpm --filter @gazelle/gateway test
pnpm --filter @gazelle/orders test
pnpm --filter @gazelle/notifications test
```

Regression expectations:
- unauthorized auth paths return `401` and contract error payload
- malformed `x-user-id` returns `400 INVALID_USER_CONTEXT`
- idempotent retry paths do not duplicate side effects

## Terraform Alarm Coverage

`infra/terraform/modules/observability` provisions per-service alarms:
- `cpu-high` (`AWS/ECS:CPUUtilization`)
- `memory-high` (`AWS/ECS:MemoryUtilization`)
- `running-task-low` (`AWS/ECS:RunningTaskCount`)

Review plan before apply:

```bash
terraform -chdir=infra/terraform/envs/dev plan
```

During incident triage, confirm alarm state and affected service:
- cluster name + service name dimensions identify blast radius quickly
