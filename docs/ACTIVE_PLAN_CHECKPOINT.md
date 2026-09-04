# Active Plan Checkpoint

Status date: 2026-09-03

This is a temporary checkpoint for resuming product work after the backend
availability detour. It records the agreed sequence and does not replace the
long-term roadmaps.

## Decision Lock

- All current product work stays on `develop`.
- Do not promote to `main` or create a new production release yet.
- Restoring the backend on Heroku is an operational detour, not a change to
  product scope or sequencing.
- Development validation must use the external Supabase development database.
- Production deploys remain release-driven: a published GitHub release with
  release notes is required before the production backend deploys.

## Branch Checkpoint

- Remote `develop`: `435f055` (`fix(onboarding): harden tenant mobile release workflow`)
- Remote `main`: `10c5527` (`feat(gateway): cap order stream connections`)
- Latest release: `v1.0.10`
- Branch relationship at this checkpoint:
  - `develop` has 26 commits not on `main`.
  - `main` has two cherry-picked commits not in the direct `develop` history.
  - The behavior from those two commits is already represented on `develop`.
- Latest successful `develop` deployment: GitHub Actions run `32436242999`
  on 2026-08-21, before the backend hosts went offline.

## Current Product Objective

Finish a repeatable, secure, multi-tenant merchant journey:

1. A merchant discovers Nomly on the marketing site.
2. The merchant signs in or creates an operator account.
3. Nomly collects business, organization, and location information.
4. Nomly recommends the appropriate plan.
5. The merchant connects Stripe and enters the workspace.
6. The merchant configures and previews a branded customer app.
7. Readiness checks prevent incomplete submissions.
8. Nomly prepares, builds, submits, and tracks the merchant-specific app.
9. The merchant can operate and support the live product without database
   surgery or routine manual production changes.

## Implemented On Develop

The following foundation exists in code on `develop`:

- Public merchant signup and dashboard-entry flow.
- Tenant, client, and location bootstrap.
- Onboarding state and readiness tracking.
- Stripe Connect onboarding and recovery handling.
- Branded app identity and launch checklist.
- Mobile experience editor with configurable sections.
- Draft, publish, revision, and rollback behavior for mobile experiences.
- Merchant mobile-build preparation, release jobs, worker, and status metadata.
- Submission gates for incomplete merchant applications.
- Checkout and payment recovery actions in the support surface.
- Sentry review tooling and release/deployment diagnostics.
- Development marketing domain and development-dashboard CTA routing.

These features have automated coverage and passed the August 21 development
deployment, but they must be revalidated after backend recovery.

## Partially Complete

The following areas have foundations but are not complete product workflows:

- Merchant-specific binary creation and App Store submission are tracked and
  prepared, but are not fully automated end to end. See #356, #257, and #295.
- The app builder is functional infrastructure, not yet the complete polished
  Shopify-style merchant editing experience.
- Self-serve onboarding exists in code, but the newly approved authentication
  and onboarding UX is still a Figma design and has not been implemented.
- Operator authentication still needs the unified authenticator model, Sign in
  with Apple, passkeys, recovery, and password migration. See #359-#362.
- Internal assisted-onboarding task management remains open in #294.
- Supabase migrations introduced by this work still need their applied state
  verified independently in development and production.

## Design Checkpoint

The current Figma direction includes:

- Refined Nomly landing-page direction.
- Operator sign-in and account-creation flows.
- Google and Apple operator OAuth.
- Passkey enrollment and recovery.
- Guided business onboarding in a focused modal environment.
- Plan recommendation and Stripe connection.
- Workspace entry, guided readiness, app creation, and publishing.
- Desktop and mobile variants for the account-to-launch journey.

This is design work only. It must not be described as shipped product
functionality until implemented and tested.

## Current Detour: Backend Recovery

The expired DigitalOcean credits made both API hosts unavailable. The approved
recovery target is one Heroku app per environment:

- production: one always-on Basic dyno;
- development: one Eco dyno, allowed to sleep when idle;
- both environments continue to use their existing external Supabase databases;
- `api.nomly.us` and `api-dev.nomly.us` remain the public API addresses.

The code now packages the existing gateway, six domain services, notification
dispatch, payment reconciliation, and optional menu sync into one deployable
backend runtime. This is a cost-conscious packaging change, not a merge of the
domain modules. The mobile release runner remains separate because App Store
builds require a dedicated EAS-capable execution environment.

Recovery is complete only when:

1. Both Heroku apps exist with the `container` stack and the correct dyno tier.
2. Production and development use the correct external Supabase session-pooler
   URLs; the databases and data are not moved into Heroku.
3. GitHub environment configuration is synchronized without exposing secrets.
4. Database migrations complete in Heroku's release phase.
5. `/health`, `/ready`, and smoke checks pass for both environments.
6. The deployed checkout E2E passes in development.
7. Both API domains resolve to Heroku and ACM reports valid certificates.
8. Sentry is reviewed after recovery.
9. The uptime monitor records recovery and resolves stale infrastructure alerts.

Do not use backend recovery as an opportunity to promote `develop` to
`main`.

## Resume Point After Recovery

Resume the product plan in this order:

### 1. Re-establish a trustworthy development baseline

- Patch the newly disclosed dependency vulnerabilities on `develop`.
- Reconcile or replace the five stale, conflicting Dependabot pull requests.
- Confirm CodeQL and secret scanning remain clean.
- Verify every new migration against the external Supabase development database.
- Deploy the latest `develop` commit.
- Run the full repository test suite and deployed end-to-end tests.

### 2. Finish and harden multi-tenant onboarding

- Complete operator authentication work in #359-#362.
- Finish app-release automation in #356.
- Reconcile overlapping release-automation tickets #257 and #295.
- Complete assisted-onboarding operations in #294 where still required.
- Test single-location and multi-location merchants independently.
- Test incomplete, failed, retried, and resumed onboarding paths.
- Verify tenant isolation at API, persistence, dashboard, and release-job layers.

### 3. Implement and refine the approved UX

- Implement the approved authentication and account-creation experience.
- Implement the guided business-onboarding journey.
- Refine the operator workspace and app-builder experience.
- Implement the approved public landing-page direction.
- Validate responsive behavior, accessibility, empty/error/loading states, and
  recovery paths.

### 4. Start the next functional workstream

Only after the onboarding and UX stages are validated:

- #206: merchant customer profiles.
- #217: push notification receipt polling.
- #218: campaigns tables, API, dashboard, and dispatch.
- #229: customer campaign consent.

### 5. Promotion gate

Promotion to `main` requires:

- No unresolved P0 or Gate 1 incident.
- Development APIs and web surfaces healthy.
- Development migrations verified against Supabase.
- Full CI, security, integration, and deployed E2E checks green.
- Multi-tenant isolation and onboarding acceptance tests green.
- Manual acceptance of the implemented UX.
- Release notes, version decision, rollback plan, and mobile build/OTA
  classification prepared.

## Explicit Non-Goals During The Detour

- Do not begin Intelligence or campaign features.
- Do not redesign the plan while repairing infrastructure.
- Do not deploy unreleased `develop` changes to production.
- Do not build a production mobile binary from `develop`.
- Do not treat Figma completion as implementation completion.
- Do not move merchant data from Supabase into Heroku Postgres.

## Removal Condition

Update or remove this checkpoint after the backend is recovered and the
development baseline in Resume Step 1 has passed. At that point, the active
implementation plan should become the single source of truth again.
