# Client Dashboard Vercel Deployment

Last reviewed: `2026-04-01`

## Goal

Deploy the V1 client dashboard to Vercel as an independent frontend lane.

## V1 Assumptions

- single-store dashboard
- email/password sign-in
- Google SSO for provisioned accounts
- no Apple SSO in V1
- no audit history UI in V1
- no multi-store switcher in V1

## Repo Assets

- app: `apps/operator-web`
- workflow: `.github/workflows/client-dashboard-vercel.yml`
- example env payload: `apps/operator-web/.env.example`

## Required GitHub Secrets

- `CLIENT_DASHBOARD_VERCEL_TOKEN`
- `CLIENT_DASHBOARD_VERCEL_ORG_ID`
- `CLIENT_DASHBOARD_VERCEL_PROJECT_ID`
- `CLIENT_DASHBOARD_VERCEL_ENV`

## Build-Time Runtime Wiring

The dashboard is a Vite app, so build-time `VITE_*` values must be present before `vite build`.

Store a full dotenv-style payload in `CLIENT_DASHBOARD_VERCEL_ENV`.

Recommended initial content:

```env
VITE_API_BASE_URL=https://your-public-api-or-tunnel.example.com
```

Later, replace it with the real API URL:

```env
VITE_API_BASE_URL=https://api.example.com
```

Use this secret as the active build-time config for the deployed dashboard workflow. This lets you:

- point the live dashboard at a local or tunneled API before backend deployment
- later rotate the secret to the real production API URL without changing workflow code
- add future `VITE_*` values without redesigning the workflow

The workflow writes this secret to `apps/operator-web/.env.local` and `apps/operator-web/.env.production.local` before `vercel build`.

## Vercel Project Setup

1. Import the GitHub repository into Vercel.
2. Create a dedicated Vercel project for the client dashboard.
3. Set the Root Directory to `apps/operator-web`.
4. Keep the framework preset as `Vite`.
5. Use the default Vercel project settings unless Vercel fails to detect them.
6. Add the custom dashboard domain in the Vercel project Domains settings.

## Deploy Flow

1. Ensure the Vercel project is linked to `apps/operator-web`.
2. Ensure the dashboard domain is configured in Vercel and DNS points to Vercel.
3. Configure the four GitHub secrets listed above.
4. Trigger `client-dashboard-vercel` from GitHub Actions or push a matching change to `main`.
5. The workflow:
   - verifies `apps/operator-web`
   - writes the dashboard `.env` payload locally for the build
   - pulls Vercel project configuration
   - builds prebuilt preview or production artifacts
   - deploys the prebuilt artifacts to Vercel

## Validate

- `https://<your-client-dashboard-domain>`
- sign-in screen loads
- authenticated dashboard requests hit the `VITE_API_BASE_URL` value from `CLIENT_DASHBOARD_VERCEL_ENV`
- preview deploys only run for pull requests
- production deploys only run for `main`

## Notes

- This lane is independent from the backend Droplet/Compose deployment.
- Backend services still deploy through `deploy-free`.
- The backend must still allow the dashboard origin through `CORS_ALLOWED_ORIGINS` or `FREE_CLIENT_DASHBOARD_DOMAIN`.
