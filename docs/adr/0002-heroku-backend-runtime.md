# ADR 0002: Heroku Backend Runtime

- Status: Accepted
- Date: 2026-09-03

## Context

The pilot backend previously ran as a Docker Compose stack on two DigitalOcean
Droplets. The promotional credits funding those hosts expired. Nomly needs an
available dev and production backend within the GitHub Student Pack Heroku
credit while retaining a credible scaling path.

The Compose topology has a public gateway, six domain services, three normal
background workers, a mobile release worker, Caddy, and Valkey. Running each as
a separate Heroku dyno would exceed the available pilot budget.

Nomly's durable data already lives in two external Supabase Postgres projects.
The hosting migration must not copy or move that data.

## Decision

Create one Heroku app per environment:

- `nomly-api-dev`: one Eco web dyno;
- `nomly-api-prod`: one Basic web dyno.

Deploy a modular-monolith runtime that starts the existing Fastify applications
on loopback ports, exposes only the gateway on Heroku's assigned `PORT`, and
runs notifications dispatch, payment reconciliation, and optional menu sync in
the same process. Domain packages, service APIs, repositories, and contracts
remain independent.

Heroku terminates TLS, so Caddy is not included. Valkey is omitted while there
is exactly one web dyno; existing polling fallbacks and process-local rate limits
remain active.

Use the external Supabase shared pooler in session mode for runtime traffic.
Heroku Common Runtime needs IPv4, while Supabase direct endpoints are IPv6 unless
the project has the IPv4 add-on.

Run schema migrations in Heroku's release phase. Deploy `develop` only after CI
passes. Deploy production only from a published GitHub Release for the current
`main` commit.

The mobile release worker is not embedded. EAS and App Store jobs need a
separate trusted runner with source checkout and Apple/Expo credentials.

## Consequences

- Pilot cost fits one Basic and one Eco dyno.
- The application still has separate domain boundaries but shares one failure
  and memory boundary per environment.
- Eco wake-up latency is acceptable for development but not production.
- A process restart stops all services and workers together; jobs must remain
  idempotent and database-backed.
- The filesystem is ephemeral. Menu-sync dead letters go to `/tmp` and are
  secondary to Sentry/log reporting.

## Scaling Gates

Before adding a second web dyno:

1. Add managed Redis/Valkey for distributed event delivery and rate limiting.
2. Move notification dispatch, payment reconciliation, and menu sync to worker
   dynos.
3. Measure memory and Postgres connection use, then move production to Standard
   dynos with Preboot.
4. Split high-load domain services into their own dynos only when traffic or
   ownership requires it; their current package/API boundaries already support
   that extraction.
5. Move to ECS/Fargate, Kubernetes, or another container platform only when the
   operational benefit exceeds Heroku's simplicity.
