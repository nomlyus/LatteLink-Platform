# Free-First Smoke Check Runbook

Last reviewed: `2026-04-01`

## Goal

Provide one repeatable smoke-check flow for the pilot stack running on the free-first DigitalOcean host.

## What It Verifies

- gateway edge health: `/health`, `/ready`, `/metrics`
- contract surface: `/v1/meta/contracts`
- request ID echoing from the public API edge
- optional client dashboard CORS for the deployed Vercel origin
- optional operator sign-in plus admin order read through the real gateway path

## Script

Use:

- `infra/free/bin/smoke-check.sh`

The script accepts either:

- a first argument: `https://api.example.com/v1`
- or env var: `API_BASE_URL=https://api.example.com/v1`

## Basic Run

```bash
API_BASE_URL=https://api.example.com/v1 \
./infra/free/bin/smoke-check.sh
```

## Run With Client Dashboard CORS Check

```bash
API_BASE_URL=https://api.example.com/v1 \
CLIENT_DASHBOARD_ORIGIN=https://client.example.com \
./infra/free/bin/smoke-check.sh
```

## Run With Operator Flow Check

Use a real pilot owner or manager account if you want the smoke check to verify auth plus an admin read through gateway -> identity -> orders.

```bash
API_BASE_URL=https://api.example.com/v1 \
SMOKE_OPERATOR_EMAIL=owner@example.com \
SMOKE_OPERATOR_PASSWORD='replace-me' \
./infra/free/bin/smoke-check.sh
```

## Trace a Failed Pilot Action

The script emits one `trace request id`. Use it to inspect the service path on the host:

```bash
docker compose logs gateway identity orders payments notifications | rg 'free-smoke-'
```

For a specific trace:

```bash
docker compose logs gateway identity orders payments notifications | rg '<trace-request-id>'
```

The expected path for the operator flow is:

- gateway receives the request
- gateway calls identity for `/v1/operator/auth/me`
- gateway calls orders for `/v1/orders`
- each service emits logs with the same `requestId`

## Release Checklist

For a free-first pilot release, record:

- deployed image tag
- API URL checked
- dashboard origin checked, if applicable
- operator account used for smoke test, if applicable
- trace request ID from the last successful smoke run
- any skipped checks and why

## Failure Handling

If smoke check fails:

1. capture the failing endpoint and trace request ID
2. inspect gateway logs first
3. follow the same request ID through identity/orders/payments/notifications
4. do not call the release good until the failed step is explained or fixed
