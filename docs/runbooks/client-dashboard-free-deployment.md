# Client Dashboard Free Deployment

Last reviewed: `2026-04-01`

## Goal

Deploy the V1 client dashboard as a static site on the same free-first host as the backend stack.

## V1 Assumptions

- single-store dashboard
- email/password sign-in
- Google SSO for provisioned accounts
- no Apple SSO in V1
- no audit history UI in V1
- no multi-store switcher in V1

## Repo Assets

- app: `apps/operator-web`
- workflow: `.github/workflows/client-dashboard-free.yml`
- edge config: `infra/free/Caddyfile`
- compose stack: `infra/free/docker-compose.yml`

## Required GitHub Variables

- `FREE_CLIENT_DASHBOARD_DOMAIN`
- `FREE_DEPLOY_PATH` (optional, default `/opt/gazelle-free`)

## Required GitHub Secrets

- `FREE_DEPLOY_HOST`
- `FREE_DEPLOY_USER`
- `FREE_DEPLOY_SSH_KEY`
- `LETSENCRYPT_EMAIL`
- `FREE_CLIENT_DASHBOARD_ENV`

## Build-Time Runtime Wiring

The dashboard is a Vite app, so build-time `VITE_*` values must be present before `vite build`.

Store a full dotenv-style payload in `FREE_CLIENT_DASHBOARD_ENV`.

Recommended initial content:

```env
VITE_API_BASE_URL=http://127.0.0.1:8080
```

Later, replace it with the real API URL:

```env
VITE_API_BASE_URL=https://api.example.com
```

Use this secret as the active build-time config for the deployed dashboard. This lets you:

- point the live dashboard at a local or tunneled API before backend deployment
- later rotate the secret to the real production API URL without changing workflow code
- add future `VITE_*` values without redesigning the workflow

The workflow writes this secret to `apps/operator-web/.env.production.local` before build.

## Deploy Flow

1. Ensure the free-first host is already provisioned and reachable over SSH.
2. Ensure DNS for the client dashboard domain points to the same host as the API.
3. Trigger `client-dashboard-free` from GitHub Actions or push a matching change to `main`.
4. The workflow:
   - verifies `apps/operator-web`
   - builds the static bundle
   - copies `dist/` to `<FREE_DEPLOY_PATH>/client-dashboard`
   - syncs Caddy/compose files
   - updates `.env` with `CLIENT_DASHBOARD_DOMAIN`
   - reloads `caddy`

## Validate

- `https://<FREE_CLIENT_DASHBOARD_DOMAIN>`
- sign-in screen loads
- authenticated dashboard requests hit the `VITE_API_BASE_URL` value from `FREE_CLIENT_DASHBOARD_ENV`

## Notes

- This lane only deploys the static dashboard shell and Caddy routing.
- Backend services still deploy through `deploy-free`.
- If `FREE_CLIENT_DASHBOARD_DOMAIN` is not configured, the workflow verifies the app and skips deployment.
