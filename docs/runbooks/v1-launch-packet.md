# V1 Launch Packet

Last reviewed: `2026-04-27`

## Purpose

This is the compact rollout packet for the current V1 launch model.

If this file conflicts with another older V1 document, defer to:

- [two-environment-deploy.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/two-environment-deploy.md)
- [development-flow.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/development-flow.md)
- [github-setup-checklist.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/github/github-setup-checklist.md)

## Current Deployment Model

- backend `dev`: `https://api-dev.nomly.us`
- backend `production`: `https://api.nomly.us`
- mobile `beta` build: `com.lattelink.rawaq.beta` -> `api-dev.nomly.us`
- mobile `production` build: `com.lattelink.rawaq` -> `api.nomly.us`
- dashboard: Vercel
- marketing site: Vercel

Backend delivery path:

- push to `develop`
- auto-deploy to `dev`
- verify candidate in `dev`
- promote exact SHA to `production`

## Repo-Ready Definition

The repo is ready when:

- the required launch tickets are merged
- `develop` deploys cleanly to `dev`
- `deploy-prod` can promote a tested SHA
- the runbooks below reflect the live operating model

## Live-Ready Definition

V1 is live-ready only when all of the following are true:

- backend `dev` and `production` are healthy
- `dev` and `production` use separate Supabase databases
- restore and recovery steps have been rehearsed
- dashboard is live and pointed at the correct backend per environment
- marketing site is live and lead intake works
- mobile beta build passes real-device QA against `api-dev.nomly.us`
- production mobile bundle is registered when you are ready to ship that lane

## Authoritative Runbooks

Backend:

- [two-environment-deploy.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/two-environment-deploy.md)
- [free-first-smoke-check.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-smoke-check.md)
- [database-backup-restore.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/database-backup-restore.md)

Frontend:

- [client-dashboard-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-vercel-deployment.md)
- [lattelink-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/lattelink-vercel-deployment.md)

Mobile:

- [mobile-eas-builds.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-eas-builds.md)
- [mobile-testflight-pilot-release.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-testflight-pilot-release.md)
- [mobile-pilot-purchase-flow-qa.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-pilot-purchase-flow-qa.md)

Provider setup:

- [production-prerequisites.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/production-prerequisites.md)
- [clover-payment-integration.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/clover-payment-integration.md)
- [client-dashboard-google-sso.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-google-sso.md)

## External Setup Still Required

- Apple Developer / App Store Connect setup for the production mobile bundle when that lane is needed
- Vercel project settings and domains for dashboard and marketing
- provider credentials for Google OAuth, Clover, Stripe, push, and media storage as needed
- final DNS and environment-variable verification for all public domains

## Launch Evidence Checklist

Capture this before calling V1 live-ready:

- successful `deploy-dev` run URL
- successful `deploy-prod` run URL
- green `/health` and `/ready` for `api-dev.nomly.us`
- green `/health` and `/ready` for `api.nomly.us`
- smoke-check result for the live backend
- restore drill result
- dashboard preview -> `api-dev.nomly.us` proof
- dashboard production -> `api.nomly.us` proof
- mobile beta QA proof
- payment-path QA proof for the active launch lane
