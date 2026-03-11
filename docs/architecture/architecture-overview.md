# Architecture Overview

## Public API

- Base URL: `https://api.gazellecoffee.com/v1`
- Entry point: `services/gateway`
- Contract source of truth: `packages/contracts/*`

## Services

- `gateway`: public API gateway, auth enforcement, rate-limiting boundary
- `identity`: Apple auth, passkeys, magic-link fallback
- `catalog`: menu + store config
- `orders`: quote/create/cancel/order history/status
- `payments`: Apple Pay + Clover orchestration
- `loyalty`: points ledger and balances
- `notifications`: push token registration and notification dispatch
- `workers/menu-sync`: synchronization from existing `WebApp` content API
- `workers/notifications-dispatch`: drains notifications outbox and simulates provider dispatch

## Shared Packages

- `contracts/*`: domain request/response schemas (Zod)
- `persistence`: shared persistence bootstrap and table provisioning helpers
- `design-tokens`: Gazelle design language tokens
- `sdk-mobile`: generated typed SDK for mobile app
- `config-eslint`, `config-typescript`: shared tooling

## Data Ownership

Single Postgres instance with schema-per-service:

- `identity_*`
- `catalog_*`
- `orders_*`
- `payments_*`
- `loyalty_*`
- `notifications_*`

## Observability Baseline

Every service exposes:

- `GET /health`
- `GET /ready`
- `GET /metrics` (service-level request counters)
- structured request logs with request IDs
