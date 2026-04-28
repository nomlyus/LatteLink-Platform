# V1 Launch Packet

Last reviewed: `2026-04-27`

## Purpose

This document is the single rollout packet for taking V1 from repo-ready to live-ready.

Use it to answer three questions without jumping between roadmap docs:

- what is already complete in the repo
- what still requires external setup or credentials
- what evidence must exist before calling V1 live-ready

## Repo-Ready Vs Live-Ready

### Repo-Ready

The repo is ready when:

- the required V1 tickets are merged on `main`
- the `develop` -> `dev` -> promoted SHA -> `production` delivery path in [development-flow.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/development-flow.md) is ready to execute
- the deploy, dashboard, marketing-site, and mobile runbooks already exist in the repo
- the launch packet below is the working source of truth

### Live-Ready

V1 is live-ready only when all of the following are true:

- the backend is deployed on the free-first `DigitalOcean` host from `GHCR`
- the deployed backend passes smoke checks
- the restore drill has been rehearsed successfully on the deployed host
- the client dashboard is live on `Vercel` and passes browser QA
- LatteLink web is live on `Vercel` and lead intake works in production
- required provider configuration is in place for Google OAuth, Clover, and any launch payment path that depends on Apple Pay
- the mobile beta/TestFlight lane is configured and a real-device QA pass succeeds against the deployed backend
- the evidence checklist at the end of this packet is complete

## Authoritative Runbooks

Use these as the authoritative source docs for each phase:

| Phase                  | Runbooks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend deploy         | [free-first-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-deployment.md), [free-first-smoke-check.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-smoke-check.md), [free-first-postgres-restore-drill.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-postgres-restore-drill.md)                                                                                                                                                                              |
| Client dashboard       | [client-dashboard-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-vercel-deployment.md), [client-dashboard-owner-provisioning.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-owner-provisioning.md), [client-dashboard-google-sso.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-google-sso.md), [client-dashboard-pilot-qa.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-pilot-qa.md) |
| LatteLink web          | [lattelink-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/lattelink-vercel-deployment.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Mobile build and QA    | [mobile-eas-builds.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-eas-builds.md), [mobile-testflight-pilot-release.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-testflight-pilot-release.md), [mobile-pilot-purchase-flow-qa.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-pilot-purchase-flow-qa.md), [apple-pay-checkout.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/apple-pay-checkout.md)                                                     |
| Provider prerequisites | [production-prerequisites.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/production-prerequisites.md), [clover-payment-integration.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/clover-payment-integration.md)                                                                                                                                                                                                                                                                                                                     |

For the current V1 rollout lane, this packet assumes the active path is:

- backend on `DigitalOcean` + `GHCR`
- client dashboard on `Vercel`
- LatteLink web on `Vercel`
- mobile on `Expo / EAS` plus `TestFlight`

## Work Separation

### Repo-Complete Work

These are already in the repo and do not require new credentials to prepare:

- backend deploy workflow, host bootstrap assets, smoke-check script, and restore drill scripts
- client dashboard `Vercel` workflow and deployment runbook
- owner provisioning command and Google SSO rollout guidance
- mobile env preflight, EAS build matrix, and TestFlight/QA runbooks
- LatteLink web deployment preflight and production-check runbook
- the canonical `develop`-first delivery process in [development-flow.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/development-flow.md)

### External Setup Work

These still require accounts, credentials, domains, or hosted configuration:

- DigitalOcean Droplet and DNS
- GitHub Environment vars and secrets for `deploy-dev` and `deploy-prod`
- GHCR publish execution for the selected image tag
- Vercel project/domain setup for the client dashboard
- Google OAuth web app and credentials
- Vercel project/domain/env for LatteLink web
- lead sink configuration and GA4 measurement ID
- Apple Developer, App Store Connect, TestFlight, and EAS account setup
- Clover live credentials and merchant configuration, plus Apple Pay credentials if Apple Pay is part of the launch

### Live Validation Work

These happen only after deployable environments exist:

- backend smoke check against the deployed API
- restore drill on the deployed backend host
- deployed client-dashboard browser QA
- Google SSO success and deny-path validation
- LatteLink production lead-intake and analytics verification
- real-device mobile QA against the deployed backend
- provider validation for the Clover payment path being launched, plus Apple Pay if it is part of the launch

## Cross-Surface Launch Checklist

Execute these steps in order to move from repo-ready to live-ready. This is the exact release sequence for the current V1 lane.

1. Confirm the release candidate on `develop`.
   Validate the release candidate locally, push it to `develop` using the flow in [development-flow.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/development-flow.md), then verify the shared `dev` deployment.

2. Prepare backend hosting inputs.
   Complete the `DigitalOcean`, DNS, GitHub var, and GitHub secret setup in [free-first-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-deployment.md).

3. Publish backend images to `GHCR`.
   Let the `develop` push trigger `publish-images`, then use that full git SHA as the deployed image reference.

4. Deploy the backend to the `dev` environment.
   Let `deploy-dev` apply the tested SHA and confirm the generated runtime env is valid.

5. Run deployed backend validation.
   Execute the smoke flow in [free-first-smoke-check.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-smoke-check.md), then run the restore rehearsal in [free-first-postgres-restore-drill.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-postgres-restore-drill.md).

6. Promote the backend SHA to `production`.
   Run `deploy-prod` with the exact SHA that passed in `dev`.

7. Stand up the client dashboard on `Vercel`.
   Create the project, configure the domain and `CLIENT_DASHBOARD_VERCEL_ENV`, and deploy using [client-dashboard-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-vercel-deployment.md).

8. Create the first owner account and run browser QA.
   Provision the owner with [client-dashboard-owner-provisioning.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-owner-provisioning.md), then run the deployed dashboard checks in [client-dashboard-pilot-qa.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-pilot-qa.md).

9. Enable Google SSO if it is part of the launch.
   Configure Google OAuth and the backend runtime mapping from [client-dashboard-google-sso.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-google-sso.md), redeploy the backend if needed, then validate both success and deny paths.

10. Stand up LatteLink web on `Vercel`.
   Configure the project, domain, lead-delivery env, and optional GA4 measurement ID from [lattelink-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/lattelink-vercel-deployment.md), then verify the live lead path.

10. Complete provider setup for live payments.
    Satisfy the Clover prerequisites in [production-prerequisites.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/production-prerequisites.md), add any Apple Pay prerequisites that are part of the chosen launch path, and map the live Clover inputs through [clover-payment-integration.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/clover-payment-integration.md).

11. Prepare the mobile release lane.
    Set the `beta` build env from [mobile-eas-builds.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-eas-builds.md), confirm the App Store Connect/TestFlight alignment from [mobile-testflight-pilot-release.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-testflight-pilot-release.md), and create the first TestFlight candidate.

12. Run real-device mobile QA against the deployed backend.
    Use [mobile-pilot-purchase-flow-qa.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-pilot-purchase-flow-qa.md) for the device run. If Apple Pay is part of the launch, use [apple-pay-checkout.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/apple-pay-checkout.md) for Apple Pay expectations; otherwise validate the Clover card checkout path documented in [clover-payment-integration.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/clover-payment-integration.md).

13. Review the evidence checklist and make the launch decision.
    Do not call V1 live-ready until every required evidence item below exists and any skipped item has a written reason.

## External Input Matrix

Each external credential or hosted input should be entered once, at the destination shown below.

| Input                                     | Destination                              | Used by                                                                  | Source                                                                                                                                                |
| ----------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| DigitalOcean Droplet                      | backend host                             | free-first backend deployment                                            | [free-first-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-deployment.md)                           |
| `api.<your-domain>` DNS                   | public backend domain                    | gateway edge and TLS                                                     | [free-first-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-deployment.md)                           |
| `FREE_DEPLOY_HOST`                        | GitHub secret                            | `deploy-free` host target                                                | [free-first-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-deployment.md)                           |
| `FREE_DEPLOY_USER`                        | GitHub secret                            | `deploy-free` SSH user                                                   | [free-first-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-deployment.md)                           |
| `FREE_DEPLOY_SSH_KEY`                     | GitHub secret                            | `deploy-free` SSH auth                                                   | [free-first-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-deployment.md)                           |
| `LETSENCRYPT_EMAIL`                       | GitHub secret                            | backend TLS provisioning                                                 | [free-first-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-deployment.md)                           |
| `FREE_API_DOMAIN`                         | GitHub variable                          | backend public domain routing                                            | [free-first-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-deployment.md)                           |
| `FREE_IMAGE_REGISTRY_PREFIX`              | GitHub variable                          | `deploy-free` image resolution                                           | [free-first-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-deployment.md)                           |
| `DATABASE_URL`                            | GitHub environment secret                | deployed Supabase/Postgres runtime                                       | [free-first-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-deployment.md)                           |
| `FREE_GATEWAY_INTERNAL_API_TOKEN`         | GitHub secret                            | gateway internal service auth                                            | [free-first-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-deployment.md)                           |
| `FREE_ORDERS_INTERNAL_API_TOKEN`          | GitHub secret                            | orders internal service auth                                             | [free-first-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-deployment.md)                           |
| `FREE_LOYALTY_INTERNAL_API_TOKEN`         | GitHub secret                            | loyalty internal service auth                                            | [free-first-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-deployment.md)                           |
| `FREE_NOTIFICATIONS_INTERNAL_API_TOKEN`   | GitHub secret                            | notifications internal service auth                                      | [free-first-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-deployment.md)                           |
| `FREE_JWT_SECRET`                         | GitHub secret                            | backend session and auth runtime                                         | [free-first-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-deployment.md)                           |
| `FREE_CLIENT_DASHBOARD_DOMAIN`            | GitHub variable                          | backend CORS allowlist default for the deployed dashboard                | [free-first-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-deployment.md)                           |
| `CLIENT_DASHBOARD_VERCEL_TOKEN`           | GitHub secret                            | client-dashboard Vercel deploy workflow                                  | [client-dashboard-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-vercel-deployment.md) |
| `CLIENT_DASHBOARD_VERCEL_ORG_ID`          | GitHub secret                            | client-dashboard Vercel project link                                     | [client-dashboard-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-vercel-deployment.md) |
| `CLIENT_DASHBOARD_VERCEL_PROJECT_ID`      | GitHub secret                            | client-dashboard Vercel project link                                     | [client-dashboard-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-vercel-deployment.md) |
| `CLIENT_DASHBOARD_VERCEL_ENV`             | GitHub secret                            | dashboard build-time `VITE_*` payload, including `VITE_API_BASE_URL`     | [client-dashboard-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-vercel-deployment.md) |
| Client dashboard custom domain and DNS    | Vercel project settings and DNS provider | live dashboard URL                                                       | [client-dashboard-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-vercel-deployment.md) |
| Google OAuth web app                      | Google Cloud Console                     | client-dashboard Google sign-in                                          | [client-dashboard-google-sso.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-google-sso.md)               |
| `FREE_GOOGLE_OAUTH_CLIENT_ID`             | GitHub secret                            | backend Google OAuth runtime                                             | [client-dashboard-google-sso.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-google-sso.md)               |
| `FREE_GOOGLE_OAUTH_CLIENT_SECRET`         | GitHub secret                            | backend Google OAuth runtime                                             | [client-dashboard-google-sso.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-google-sso.md)               |
| `FREE_GOOGLE_OAUTH_STATE_SECRET`          | GitHub secret                            | backend Google OAuth state signing                                       | [client-dashboard-google-sso.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-google-sso.md)               |
| `FREE_GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS` | GitHub variable                          | backend Google redirect allowlist                                        | [client-dashboard-google-sso.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-google-sso.md)               |
| `LATTELINK_VERCEL_TOKEN`                  | GitHub secret                            | LatteLink web Vercel deploy workflow                                     | [lattelink-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/lattelink-vercel-deployment.md)               |
| `LATTELINK_VERCEL_ORG_ID`                 | GitHub secret                            | LatteLink web Vercel project link                                        | [lattelink-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/lattelink-vercel-deployment.md)               |
| `LATTELINK_VERCEL_PROJECT_ID`             | GitHub secret                            | LatteLink web Vercel project link                                        | [lattelink-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/lattelink-vercel-deployment.md)               |
| LatteLink public domain and DNS           | Vercel project settings and DNS provider | live marketing site URL                                                  | [lattelink-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/lattelink-vercel-deployment.md)               |
| `LATTELINK_CONTACT_WEBHOOK_URL`           | Vercel environment variable              | production lead delivery by webhook                                      | [lattelink-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/lattelink-vercel-deployment.md)               |
| `LATTELINK_CONTACT_WEBHOOK_BEARER_TOKEN`  | Vercel environment variable              | authenticated webhook lead delivery                                      | [lattelink-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/lattelink-vercel-deployment.md)               |
| `RESEND_API_KEY`                          | Vercel environment variable              | production lead delivery by email                                        | [lattelink-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/lattelink-vercel-deployment.md)               |
| `LATTELINK_CONTACT_EMAIL_TO`              | Vercel environment variable              | lead email destination                                                   | [lattelink-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/lattelink-vercel-deployment.md)               |
| `LATTELINK_CONTACT_EMAIL_FROM`            | Vercel environment variable              | lead email sender identity                                               | [lattelink-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/lattelink-vercel-deployment.md)               |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID`           | Vercel environment variable              | production GA4 instrumentation                                           | [lattelink-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/lattelink-vercel-deployment.md)               |
| Apple Developer account                   | Apple Developer                          | app capabilities, merchant setup, signing                                | [production-prerequisites.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/production-prerequisites.md)                     |
| App Store Connect app record              | App Store Connect                        | TestFlight distribution target for the beta app                          | [mobile-testflight-pilot-release.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-testflight-pilot-release.md)       |
| TestFlight tester list                    | App Store Connect / TestFlight           | pilot build distribution                                                 | [mobile-testflight-pilot-release.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-testflight-pilot-release.md)       |
| `EXPO_TOKEN`                              | GitHub or operator environment           | `EAS` authentication                                                     | [production-prerequisites.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/production-prerequisites.md)                     |
| `APP_VERSION`                             | mobile build env                         | version shown by the mobile build; should match the repo release version | [mobile-eas-builds.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-eas-builds.md)                                   |
| `IOS_BUNDLE_IDENTIFIER`                   | mobile build env                         | App Store Connect and provisioning target                                | [mobile-eas-builds.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-eas-builds.md)                                   |
| `EXPO_PUBLIC_API_BASE_URL`                | mobile build env                         | deployed backend target for the mobile app                               | [mobile-eas-builds.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-eas-builds.md)                                   |
| `EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID`       | mobile build env                         | Apple Pay merchant alignment in the mobile app                           | [mobile-eas-builds.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-eas-builds.md)                                   |
| Clover production account                 | Clover                                   | live merchant approval and live payment processing                       | [production-prerequisites.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/production-prerequisites.md)                     |
| `FREE_PAYMENTS_PROVIDER_MODE`             | GitHub variable                          | backend switch from simulated to live payments                           | [clover-payment-integration.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/clover-payment-integration.md)                 |
| `FREE_CLOVER_OAUTH_ENVIRONMENT`           | GitHub variable                          | Clover runtime environment selection                                     | [clover-payment-integration.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/clover-payment-integration.md)                 |
| `FREE_CLOVER_CHARGE_ENDPOINT`             | GitHub variable                          | backend live Clover charge endpoint                                      | [clover-payment-integration.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/clover-payment-integration.md)                 |
| `FREE_CLOVER_REFUND_ENDPOINT`             | GitHub variable                          | backend live Clover refund endpoint                                      | [clover-payment-integration.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/clover-payment-integration.md)                 |
| `FREE_CLOVER_APPLE_PAY_TOKENIZE_ENDPOINT` | GitHub variable                          | backend live Clover tokenization endpoint for card entry and Apple Pay   | [clover-payment-integration.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/clover-payment-integration.md)                 |
| `FREE_CLOVER_BEARER_TOKEN`                | GitHub secret                            | backend live Clover bearer credential                                    | [clover-payment-integration.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/clover-payment-integration.md)                 |
| `FREE_CLOVER_API_KEY`                     | GitHub secret                            | backend Clover legacy fallback credential                                | [clover-payment-integration.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/clover-payment-integration.md)                 |
| `FREE_CLOVER_API_ACCESS_KEY`              | GitHub secret                            | backend Clover tokenization/public API access                            | [clover-payment-integration.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/clover-payment-integration.md)                 |
| `FREE_CLOVER_MERCHANT_ID`                 | GitHub secret                            | backend merchant binding for Clover                                      | [clover-payment-integration.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/clover-payment-integration.md)                 |
| `FREE_CLOVER_APP_ID`                      | GitHub secret                            | Clover OAuth app configuration                                           | [clover-payment-integration.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/clover-payment-integration.md)                 |
| `FREE_CLOVER_APP_SECRET`                  | GitHub secret                            | Clover OAuth app configuration                                           | [clover-payment-integration.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/clover-payment-integration.md)                 |
| `FREE_CLOVER_OAUTH_REDIRECT_URI`          | GitHub secret                            | Clover OAuth callback target                                             | [clover-payment-integration.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/clover-payment-integration.md)                 |
| `FREE_CLOVER_OAUTH_STATE_SECRET`          | GitHub secret                            | Clover OAuth state validation                                            | [clover-payment-integration.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/clover-payment-integration.md)                 |
| `FREE_CLOVER_WEBHOOK_SHARED_SECRET`       | GitHub secret                            | Clover webhook signature validation                                      | [clover-payment-integration.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/clover-payment-integration.md)                 |

## Launch Evidence Checklist

The launch is not complete until the following evidence exists in release notes or the operating log for the chosen version.

| Evidence                               | What to record                                                                                                                                     | Source                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend deploy record                  | release tag, image tag, target API domain, deployment timestamp                                                                                    | [free-first-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-deployment.md)                                                                                                                                                                                                                                                                                           |
| Deployed smoke check transcript        | API URL checked, dashboard origin checked, operator account used if applicable, trace request ID, pass/fail notes                                  | [free-first-smoke-check.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-smoke-check.md)                                                                                                                                                                                                                                                                                         |
| Restore drill transcript               | timestamp, backup filename, verification output, pass/fail result                                                                                  | [free-first-postgres-restore-drill.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/free-first-postgres-restore-drill.md)                                                                                                                                                                                                                                                                   |
| Client dashboard deploy proof          | deployed dashboard URL, Vercel production deploy reference, active `VITE_API_BASE_URL` target                                                      | [client-dashboard-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-vercel-deployment.md)                                                                                                                                                                                                                                                                 |
| Owner provisioning record              | owner email, location ID, timestamp, whether created or updated                                                                                    | [client-dashboard-owner-provisioning.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-owner-provisioning.md)                                                                                                                                                                                                                                                               |
| Client dashboard QA log                | owner and staff QA rows, environment, store, result, blocking findings if any                                                                      | [client-dashboard-pilot-qa.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-pilot-qa.md)                                                                                                                                                                                                                                                                                   |
| Google SSO validation transcript       | `/v1/operator/auth/providers` check, success case, deny case, final redirect URI used                                                              | [client-dashboard-google-sso.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-google-sso.md)                                                                                                                                                                                                                                                                               |
| LatteLink web production check         | live URL, lead-intake success proof, delivery sink confirmation, robots/sitemap check, GA4 confirmation if enabled                                 | [lattelink-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/lattelink-vercel-deployment.md)                                                                                                                                                                                                                                                                               |
| Mobile build record                    | build profile, bundle identifier, backend URL, build number, TestFlight link or build reference                                                    | [mobile-testflight-pilot-release.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-testflight-pilot-release.md)                                                                                                                                                                                                                                                                       |
| Real-device mobile QA log              | timestamp, environment, device, account, order ID, result, notes                                                                                   | [mobile-pilot-purchase-flow-qa.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-pilot-purchase-flow-qa.md)                                                                                                                                                                                                                                                                           |
| Payment/provider validation transcript | payment path used (`Clover card` or `Apple Pay`), Clover mode, one successful payment path, any refund or webhook check performed, pass/fail notes | [production-prerequisites.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/production-prerequisites.md), [clover-payment-integration.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/clover-payment-integration.md), [mobile-pilot-purchase-flow-qa.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-pilot-purchase-flow-qa.md) |

## Minimum Go / No-Go Rule

Do not call V1 live-ready if any of these are missing:

- a successful deployed backend smoke-check record
- a successful restore-drill record
- a successful deployed dashboard QA pass
- a successful mobile real-device QA pass against the deployed backend
- a successful production lead-intake check for LatteLink web
- a provider validation record for the payment path being launched

If any item is intentionally deferred, record:

- what was deferred
- why it was deferred
- who approved the exception
- what follow-up ticket owns the gap
