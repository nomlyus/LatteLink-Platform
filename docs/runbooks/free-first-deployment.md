# Free-First Deployment

Last reviewed: `2026-04-27`

## Status

This file is now a legacy pointer.

It used to describe the older single-lane `deploy-free` / `publish-free-images` model and `FREE_*` GitHub variable naming. That is no longer the active deployment system.

## Current Source Of Truth

Use these docs instead:

- [two-environment-deploy.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/two-environment-deploy.md)
- [development-flow.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/development-flow.md)
- [github-setup-checklist.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/github/github-setup-checklist.md)

## Current Deployment Model

- `develop` publishes images and auto-deploys to `dev`
- `main` is reserved for production-ready history
- `deploy-prod` promotes an exact tested SHA to `production`
- deployed environments use environment-scoped GitHub vars and secrets
- deployed environments use external `DATABASE_URL` values, not bundled droplet Postgres

## Current Workflow Names

- `.github/workflows/publish-images.yml`
- `.github/workflows/deploy-dev.yml`
- `.github/workflows/deploy-prod.yml`

## Legacy Terms To Ignore

These names are historical and should not be used for new setup:

- `deploy-free`
- `publish-free-images`
- `FREE_*` GitHub vars and secrets

If another old document still references them, defer to the current docs listed above.
