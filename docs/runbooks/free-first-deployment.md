# Free-First Deployment (GitHub Student + DigitalOcean)

Last reviewed: `2026-04-01`

## Goal

Run the full service stack on one low-cost host before AWS cutover.

## Target Topology

- One DigitalOcean Droplet (recommended start: 2 vCPU / 4 GB)
- Docker Compose stack
- Services: gateway, identity, catalog, orders, payments, loyalty, notifications
- Dependencies: PostgreSQL, Valkey
- Edge: Caddy with TLS for `api.<your-domain>`
- Client dashboard deployed separately on Vercel

## Prerequisites

- GitHub Student Pack credits are active.
- Domain is configured and DNS points to Droplet IP.
- Droplet has Docker + Docker Compose plugin installed.
- SSH deploy key configured for GitHub Actions.
- GHCR images exist for each service tag you plan to deploy.

## Repo Assets

- Compose bundle: `infra/free/docker-compose.yml`
- Caddy config: `infra/free/Caddyfile`
- Runtime env template: `infra/free/.env.example`
- Workflow: `.github/workflows/deploy-free.yml`

## Required GitHub Variables

- `FREE_API_DOMAIN` (example: `api.yourdomain.com`)
- `FREE_IMAGE_REGISTRY_PREFIX` (example: `ghcr.io/anxiousdaoud/lattelink-platform`)

Recommended:

- `FREE_DEPLOY_PATH` (default: `/opt/gazelle-free`)
- `FREE_IMAGE_TAG` (default: `latest`)
- `FREE_PASSKEY_RP_ID` (defaults to `FREE_API_DOMAIN`)

Optional:

- `FREE_CORS_ALLOWED_ORIGINS`
- `FREE_CLIENT_DASHBOARD_DOMAIN` if you want the workflow to derive the dashboard CORS origin automatically
- `FREE_GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS`

## Required GitHub Secrets

- `FREE_DEPLOY_HOST`
- `FREE_DEPLOY_USER`
- `FREE_DEPLOY_SSH_KEY`
- `LETSENCRYPT_EMAIL`
- `FREE_POSTGRES_PASSWORD`
- `FREE_GATEWAY_INTERNAL_API_TOKEN`
- `FREE_ORDERS_INTERNAL_API_TOKEN`
- `FREE_LOYALTY_INTERNAL_API_TOKEN`
- `FREE_NOTIFICATIONS_INTERNAL_API_TOKEN`
- `FREE_JWT_SECRET`

Optional:

- `GHCR_USERNAME`
- `GHCR_TOKEN`
- `FREE_GOOGLE_OAUTH_CLIENT_ID`
- `FREE_GOOGLE_OAUTH_CLIENT_SECRET`
- `FREE_GOOGLE_OAUTH_STATE_SECRET`

## Runtime Env Written By `deploy-free`

The workflow writes the server-side `.env` file from GitHub vars and secrets. The important runtime values are:

- edge and routing
  - `API_DOMAIN`
  - `LETSENCRYPT_EMAIL`
- image/source selection
  - `IMAGE_REGISTRY_PREFIX`
  - `IMAGE_TAG`
- data and auth
  - `POSTGRES_PASSWORD`
  - `DATABASE_URL`
  - `JWT_SECRET`
- internal service auth
  - `GATEWAY_INTERNAL_API_TOKEN`
  - `ORDERS_INTERNAL_API_TOKEN`
  - `LOYALTY_INTERNAL_API_TOKEN`
  - `NOTIFICATIONS_INTERNAL_API_TOKEN`
- gateway runtime
  - `CORS_ALLOWED_ORIGINS`
  - `PUBLIC_API_BASE_URL`
  - `PASSKEY_RP_ID`
- optional Google SSO
  - `GOOGLE_OAUTH_CLIENT_ID`
  - `GOOGLE_OAUTH_CLIENT_SECRET`
  - `GOOGLE_OAUTH_STATE_SECRET`
  - `GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS`

If `FREE_CORS_ALLOWED_ORIGINS` is not set, the workflow defaults CORS to `FREE_CLIENT_DASHBOARD_DOMAIN` when available.

## Deploy

1. Ensure Docker images are published to GHCR for the selected tag.
2. Trigger `deploy-free` workflow from GitHub Actions.
3. Workflow copies `infra/free` to the host, writes runtime `.env`, and runs:

```bash
docker compose pull
docker compose up -d --remove-orphans
```

## Validate

- `https://api.<your-domain>/health`
- `https://api.<your-domain>/ready`
- `https://api.<your-domain>/metrics`
- Service docs route: `https://api.<your-domain>/docs`
- If the client dashboard lane is live, confirm API requests from its Vercel domain pass CORS.

## Backup and Restore Drill

Daily backup:

```bash
docker exec -t gazelle-postgres pg_dump -U gazelle gazelle > backup.sql
```

Restore rehearsal:

```bash
cat backup.sql | docker exec -i gazelle-postgres psql -U gazelle gazelle
```

Record restore timestamp and validation result in release notes.
