# Free-First Deployment (GitHub Student + DigitalOcean)

Last reviewed: `2026-03-11`

## Goal

Run the full service stack on one low-cost host before AWS cutover.

## Target Topology

- One DigitalOcean Droplet (recommended start: 2 vCPU / 4 GB)
- Docker Compose stack
- Services: gateway, identity, catalog, orders, payments, loyalty, notifications
- Dependencies: PostgreSQL, Valkey
- Edge: Caddy with TLS for `api.<your-domain>`
- Optional static client dashboard on the same host

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
- Client dashboard workflow: `.github/workflows/client-dashboard-free.yml`

## Required GitHub Variables

- `FREE_API_DOMAIN` (example: `api.yourdomain.com`)
- `FREE_DEPLOY_PATH` (example: `/opt/gazelle-free`)
- `FREE_IMAGE_TAG` (example: `latest`)

## Required GitHub Secrets

- `FREE_DEPLOY_HOST`
- `FREE_DEPLOY_USER`
- `FREE_DEPLOY_SSH_KEY`
- `LETSENCRYPT_EMAIL`
- `FREE_POSTGRES_PASSWORD`

Optional:

- `GHCR_USERNAME`
- `GHCR_TOKEN`
- `FREE_CLIENT_DASHBOARD_DOMAIN` if deploying the client dashboard lane
- `FREE_CLIENT_DASHBOARD_ENV` if deploying the client dashboard before the backend
- `GOOGLE_OAUTH_*` env values if enabling Google SSO for the client dashboard

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
