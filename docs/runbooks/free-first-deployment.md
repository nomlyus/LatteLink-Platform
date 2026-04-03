# Free-First Deployment (GitHub Student + DigitalOcean)

Last reviewed: `2026-04-03`

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
- Generic service image Dockerfile: `infra/docker/node-service.Dockerfile`
- Smoke-check script: `infra/free/bin/smoke-check.sh`
- Host bootstrap script: `infra/free/bin/bootstrap-ubuntu-host.sh`
- Image publish workflow: `.github/workflows/publish-free-images.yml`
- Workflow: `.github/workflows/deploy-free.yml`

## Bootstrap Host

Copy the bootstrap script to a fresh Ubuntu 24.04 Droplet and run it as `root`:

```bash
scp infra/free/bin/bootstrap-ubuntu-host.sh root@<droplet-ip>:/tmp/bootstrap-ubuntu-host.sh
ssh root@<droplet-ip> 'bash /tmp/bootstrap-ubuntu-host.sh deploy /opt/gazelle-free'
```

After that:

1. Add the GitHub Actions deploy public key to `~deploy/.ssh/authorized_keys`
2. Verify Docker works for the deploy user:

```bash
su - deploy -c 'docker version'
```

3. Point `api.<your-domain>` to the Droplet IP

## Publish Images

Before the first deploy, publish the backend service images:

1. Trigger `publish-free-images` from GitHub Actions
2. Note the published SHA tag from the workflow summary, for example `sha-abc123def456`
3. On `main`, a successful publish now triggers `deploy-free` automatically and deploys that exact immutable SHA tag
4. Use manual `deploy-free` `image_tag` input overrides only when you want to redeploy or roll back to a specific immutable build

The publish workflow creates:

- `ghcr.io/<owner>/<repo>/gateway:<tag>`
- `ghcr.io/<owner>/<repo>/identity:<tag>`
- `ghcr.io/<owner>/<repo>/orders:<tag>`
- `ghcr.io/<owner>/<repo>/catalog:<tag>`
- `ghcr.io/<owner>/<repo>/payments:<tag>`
- `ghcr.io/<owner>/<repo>/loyalty:<tag>`
- `ghcr.io/<owner>/<repo>/notifications:<tag>`

## Required GitHub Variables

- `FREE_API_DOMAIN` (example: `api.yourdomain.com`)
- `FREE_IMAGE_REGISTRY_PREFIX` (example: `ghcr.io/anxiousdaoud/lattelink-platform`)

Recommended:

- `FREE_DEPLOY_PATH` (default: `/opt/gazelle-free`)
- `FREE_PASSKEY_RP_ID` (defaults to `FREE_API_DOMAIN`)

Optional:

- `FREE_IMAGE_TAG` as a manual fallback when you want `workflow_dispatch` redeploys to default to a specific immutable tag instead of `latest`
- `FREE_CORS_ALLOWED_ORIGINS`
- `FREE_CLIENT_DASHBOARD_DOMAIN` if you want the workflow to derive the dashboard CORS origin automatically
- `FREE_GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS`
- `FREE_PAYMENTS_PROVIDER_MODE` (`simulated` by default, `live` for real Clover)
- `FREE_CLOVER_OAUTH_ENVIRONMENT` (`sandbox` or `production`)
- `FREE_CLOVER_CHARGE_ENDPOINT`
- `FREE_CLOVER_REFUND_ENDPOINT`
- `FREE_CLOVER_APPLE_PAY_TOKENIZE_ENDPOINT`

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
- `FREE_CLOVER_BEARER_TOKEN`
- `FREE_CLOVER_API_KEY`
- `FREE_CLOVER_API_ACCESS_KEY`
- `FREE_CLOVER_MERCHANT_ID`
- `FREE_CLOVER_APP_ID`
- `FREE_CLOVER_APP_SECRET`
- `FREE_CLOVER_OAUTH_REDIRECT_URI`
- `FREE_CLOVER_OAUTH_STATE_SECRET`
- `FREE_CLOVER_WEBHOOK_SHARED_SECRET`

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
- optional live Clover runtime
  - `PAYMENTS_PROVIDER_MODE`
  - `CLOVER_PROVIDER_MODE`
  - `CLOVER_BEARER_TOKEN`
  - `CLOVER_API_KEY`
  - `CLOVER_API_ACCESS_KEY`
  - `CLOVER_MERCHANT_ID`
  - `CLOVER_OAUTH_ENVIRONMENT`
  - `CLOVER_APP_ID`
  - `CLOVER_APP_SECRET`
  - `CLOVER_OAUTH_REDIRECT_URI`
  - `CLOVER_OAUTH_STATE_SECRET`
  - `CLOVER_CHARGE_ENDPOINT`
  - `CLOVER_REFUND_ENDPOINT`
  - `CLOVER_APPLE_PAY_TOKENIZE_ENDPOINT`
  - `CLOVER_WEBHOOK_SHARED_SECRET`

If `FREE_CORS_ALLOWED_ORIGINS` is not set, the workflow defaults CORS to `FREE_CLIENT_DASHBOARD_DOMAIN` when available.
If `FREE_PAYMENTS_PROVIDER_MODE=live`, the workflow validates the generated server `.env` with `./bin/check-live-payments-env.sh` before running `docker compose up`.

## Deploy

Normal release path:

1. Merge the intended backend change to `main`.
2. Let `publish-free-images` finish successfully.
3. `deploy-free` triggers automatically from that workflow and deploys the matching immutable `sha-<12>` tag.

Manual deploy path:

1. Trigger `deploy-free` from GitHub Actions.
2. Leave `image_tag` blank to use the optional `FREE_IMAGE_TAG` fallback or `latest`.
3. Set `image_tag` explicitly when you want to redeploy or roll back to a known immutable tag.

In both paths the workflow copies `infra/free` to the host, writes runtime `.env`, and runs:

```bash
docker compose pull
docker compose up -d --remove-orphans
```

## Validate

Run the smoke script first:

```bash
API_BASE_URL=https://api.<your-domain>/v1 \
CLIENT_DASHBOARD_ORIGIN=https://<your-client-dashboard-domain> \
./infra/free/bin/smoke-check.sh
```

Optional operator auth flow:

```bash
API_BASE_URL=https://api.<your-domain>/v1 \
SMOKE_OPERATOR_EMAIL=owner@example.com \
SMOKE_OPERATOR_PASSWORD='replace-me' \
./infra/free/bin/smoke-check.sh
```

Manual spot checks:

- `https://api.<your-domain>/health`
- `https://api.<your-domain>/ready`
- `https://api.<your-domain>/metrics`
- `https://api.<your-domain>/v1/meta/contracts`
- Service docs route: `https://api.<your-domain>/docs`

For the full checklist and request-trace workflow, use:

- `docs/runbooks/free-first-smoke-check.md`

## Backup and Restore Drill

Use the host-side rehearsal scripts copied with `infra/free`:

```bash
./bin/rehearse-postgres-restore.sh
```

Manual backup only:

```bash
./bin/backup-postgres.sh ./backups/gazelle-$(date +%Y%m%d-%H%M%S).dump
```

For the full drill and scratch-restore flow, use:

- `docs/runbooks/free-first-postgres-restore-drill.md`

Record restore timestamp and validation result in release notes.
