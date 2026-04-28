# Client Dashboard Vercel Deployment

Last reviewed: `2026-04-27`

## Goal

Deploy `apps/client-dashboard` to Vercel with the current two-environment model:

- preview deployments for pull requests and `develop`
- production deployments from `main`

## Current Repo State

- app: `apps/client-dashboard`
- example env payload: `apps/client-dashboard/.env.example`
- linked Vercel project metadata: `apps/client-dashboard/.vercel/project.json`

There is currently **no dedicated GitHub Actions Vercel workflow** for the client dashboard in this repo. The active source of truth is the Vercel project configuration itself.

## Required Vercel Project Settings

1. Import the GitHub repository into Vercel.
2. Set the Root Directory to `apps/client-dashboard`.
3. Keep the framework preset as `Vite`.
4. Set the Vercel production branch to `main`.
5. Leave pull request deployments enabled so previews are created automatically.
6. Ensure pushes to `develop` do **not** become production deployments.

## Build-Time Runtime Wiring

The dashboard is a Vite app, so `VITE_*` values must exist at build time.

Set them directly in Vercel environment variables:

- `Preview`
  - `VITE_API_BASE_URL=https://api-dev.nomly.us/v1`
- `Production`
  - `VITE_API_BASE_URL=https://api.nomly.us/v1`

Do not point preview builds at the production API.

## Deploy Flow

- pull requests -> Vercel preview deployment
- `develop` pushes -> non-production preview deployment only
- `main` pushes -> Vercel production deployment

If Vercel Git integration is enabled, this project should not also have a parallel GitHub Actions deployment workflow unless you intentionally replace the Vercel-native flow.

## Validate

- `https://<your-client-dashboard-domain>` loads
- preview deployments resolve against `api-dev.nomly.us`
- production resolves against `api.nomly.us`
- sign-in screen loads
- authenticated requests hit the intended `VITE_API_BASE_URL`
- preview builds do not ship to the production domain

## Notes

- This lane is independent from the backend Droplet/Compose deployment.
- The backend must allow the dashboard origins through `CORS_ALLOWED_ORIGINS`.
- When Google SSO is enabled, add the deployed dashboard callback URL to the identity service redirect allowlist:
  - `https://<your-client-dashboard-domain>/?google_auth_callback=1`
