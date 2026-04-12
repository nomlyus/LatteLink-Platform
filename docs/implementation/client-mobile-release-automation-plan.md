# Client Mobile Release Automation Plan

Last updated: `2026-04-11`

## Goal

Make the admin console the source of truth for per-client mobile release configuration so onboarding a new branded client app stops depending on manual env editing, scattered Apple notes, and ad hoc release steps.

Target outcome:

- create the client in the admin console
- configure runtime store settings and mobile release settings once
- generate validated beta and production env payloads automatically
- track release readiness per client
- later trigger EAS builds and TestFlight submission from the console

## Guiding Decisions

- Store release configuration in the platform backend, not in shell scripts.
- Generate scripts and env files from stored config, not the other way around.
- Keep runtime app-config and mobile release config separate.
- Reuse the existing client creation flow in:
  - `apps/admin-console/src/app/(console)/clients/new/page.tsx`
  - `apps/admin-console/src/app/actions.ts`
- Do not automate Apple/App Store Connect object creation first. Automate data generation and validation before external API automation.

## Problem Split

Each branded client app has two categories of configuration:

### Runtime Config

Owned by the live platform and consumed through `GET /v1/app-config`.

Examples:

- store name
- market label
- hours
- pickup instructions
- fulfillment mode
- loyalty visibility
- live order tracking
- dashboard availability
- tax rate

### Release Config

Owned by the mobile release process and consumed by Expo/EAS and Apple.

Examples:

- app display names
- Expo slug
- Expo scheme
- beta bundle identifier
- production bundle identifier
- beta Apple Pay merchant identifier
- production Apple Pay merchant identifier
- privacy policy URL
- associated domains
- App Store SKU
- release notes and status

## Phase 0: Lock The Data Model

Introduce a new concept:

- `ClientMobileReleaseProfile`

Suggested fields:

- `locationId`
- `brandDisplayName`
- `betaAppDisplayName`
- `productionAppDisplayName`
- `brandSlug`
- `expoSlug`
- `expoScheme`
- `betaBundleId`
- `productionBundleId`
- `betaMerchantId`
- `productionMerchantId`
- `apiBaseUrl`
- `privacyPolicyUrl`
- `associatedDomains`
- `appStoreSku`
- `appStorePrimaryLocale`
- `supportUrl`
- `marketingUrl`
- `appleTeamNotes`
- `iconAssetStatus`
- `splashAssetStatus`
- `betaBuildStatus`
- `productionBuildStatus`
- `testflightStatus`
- `appStoreStatus`
- `lastReleaseNotes`
- `createdAt`
- `updatedAt`

Computed values:

- generated beta env payload
- generated production env payload
- release readiness status
- missing required fields

Default generation rules:

- `brandSlug` from client name
- `expoSlug` from `brandSlug`
- `expoScheme` from `brandSlug`
- `betaBundleId = com.lattelink.<brandSlug>.beta`
- `productionBundleId = com.lattelink.<brandSlug>`
- `betaMerchantId = merchant.com.lattelink.<brandSlug>.beta`
- `productionMerchantId = merchant.com.lattelink.<brandSlug>`

## Phase 1: Backend Contracts And Persistence

### Contracts

Extend:

- `packages/contracts/catalog/src/index.ts`

Add:

- `mobileReleaseProfileSchema`
- `internalLocationMobileReleaseUpdateSchema`
- `mobileReleaseReadinessSchema`

Include `mobileReleaseProfile` on internal location summary responses.

### Repository And Service Layer

Extend:

- `services/catalog/src/repository.ts`

Add support for:

- reading the mobile release profile with internal location data
- writing the profile on client creation or later edits
- generating server-side readiness results

Service methods:

- `getInternalLocation(locationId)` returns `mobileReleaseProfile`
- `bootstrapInternalLocation(...)` optionally accepts initial release config
- `updateInternalLocationMobileReleaseProfile(locationId, input)`

### Persistence

Add storage either by:

- extending the internal location JSON payload, or
- adding a new table such as `client_mobile_release_profiles`

If using a table, key by `location_id`.

Add migration under:

- `packages/persistence/src/migrations`

### Internal Admin API Routes

Add:

- `GET /v1/internal/locations/:locationId/mobile-release`
- `PUT /v1/internal/locations/:locationId/mobile-release`
- optional `POST /v1/internal/locations/:locationId/mobile-release/generate`

### Acceptance Criteria

- every client can persist a mobile release profile
- profile is returned with internal location details
- invalid bundle IDs, merchant IDs, and URLs are rejected server-side

## Phase 2: Shared Generator And Validator Package

Create a shared package:

- `packages/mobile-release-config`

This package should own:

- default generation
- env generation
- validation
- readiness checks

Functions:

- `deriveMobileReleaseDefaults(input)`
- `validateMobileReleaseProfile(input)`
- `generateBetaEnv(profile)`
- `generateProductionEnv(profile)`
- `generateReleaseChecklist(profile)`
- `getReleaseReadiness(profile)`

Refactor:

- `apps/mobile/scripts/validate-release-env.mjs`

So the CLI validator and admin console use the same validation logic.

### Acceptance Criteria

- one source of truth for mobile release validation
- generated env matches what `apps/mobile/app.config.ts` expects
- CLI and admin console produce the same pass/fail result

## Phase 3: Admin Console UX

Add a new client section:

- `Mobile Release`

Suggested routes:

- `/clients/[locationId]/mobile-release`
- `/clients/[locationId]/mobile-release/checklist`
- `/clients/[locationId]/mobile-release/builds`

### UI Sections

#### Release Identity

- brand display name
- beta app name
- production app name
- brand slug
- Expo slug
- Expo scheme

#### Apple Identifiers

- beta bundle ID
- production bundle ID
- beta merchant ID
- production merchant ID
- associated domains
- App Store SKU
- primary locale

#### Release URLs

- API base URL
- privacy policy URL
- support URL
- marketing URL

#### Assets

- icon ready
- splash ready
- screenshots ready
- App Store copy ready

#### Generated Output

- view beta env
- view production env
- copy env
- download env
- download release package

#### Readiness

- missing required fields
- warnings
- current release phase

### Client Creation Wizard Extension

Extend:

- `apps/admin-console/src/app/(console)/clients/new/page.tsx`

Add a new step:

- `Mobile Release`

Allow:

- auto-generated defaults from brand/client name
- optional skip for later completion

### Acceptance Criteria

- a non-technical operator can fill the release profile without touching the repo
- env output is visible and copyable
- readiness failures are obvious in the UI

## Phase 4: Release Package Generation

Add a generated artifact per client.

Contents:

- `.env.beta`
- `.env.production`
- App Store setup checklist
- TestFlight checklist
- required Apple identifiers
- exact build commands
- generated release notes scaffold

Example beta env shape:

```env
APP_VARIANT=beta
APP_DISPLAY_NAME_BASE=Northside Coffee
APP_VERSION=1.0.0
EXPO_SLUG=northside-coffee
EXPO_SCHEME=northsidecoffee
IOS_BUNDLE_IDENTIFIER=com.lattelink.northside.beta
IOS_ASSOCIATED_DOMAINS=webcredentials:api.northsidecoffee.com
EXPO_PUBLIC_API_BASE_URL=https://api.northsidecoffee.com/v1
EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID=merchant.com.lattelink.northside.beta
EXPO_PUBLIC_BRAND_NAME=Northside Coffee
EXPO_PUBLIC_PRIVACY_POLICY_URL=https://northsidecoffee.com/privacy
```

Generated Apple worksheet:

- create App ID
- create Merchant ID
- create App Store Connect app
- set privacy policy URL
- upload screenshots
- assign testers

### Acceptance Criteria

- operators can download a complete release package without local scripting
- generated env files pass the shared validator

## Phase 5: Release Status Tracking

Track statuses per client:

- `not_started`
- `profile_draft`
- `apple_ids_pending`
- `beta_env_ready`
- `beta_built`
- `testflight_submitted`
- `pilot_qa_passed`
- `production_env_ready`
- `production_built`
- `app_store_submitted`
- `live`

Track milestones:

- beta env generated at
- beta build created at
- TestFlight submitted at
- pilot QA passed at
- production build created at
- App Store submitted at
- live at

Add a release timeline UI and client-list filters by release state.

### Acceptance Criteria

- operators can see where each client is blocked
- release state is no longer tracked in scattered notes

## Phase 6: Build Automation

Do not run `eas build` directly inside the admin-console request path.

Preferred first implementation:

- GitHub Actions workflow dispatch

Add:

- `.github/workflows/mobile-client-release.yml`

Inputs:

- `location_id`
- `profile` (`beta` or `production`)

Workflow steps:

1. fetch the client mobile release profile from the internal admin API
2. generate env for the requested profile
3. run `pnpm --filter @lattelink/mobile release:check -- <profile>`
4. run `eas build --platform ios --profile <profile>`
5. save build URL and build ID
6. update the client release record

Admin-console actions:

- `Trigger Beta Build`
- `Trigger Production Build`

### Acceptance Criteria

- operators can trigger builds without local env editing
- build links are stored on the client record

## Phase 7: TestFlight Submission Automation

After build automation is stable, add:

- `Submit To TestFlight`
- `Mark Pilot QA Passed`

Implementation options:

- trigger `eas submit --profile beta`, or
- record and track external submission links first, then automate later

Track:

- TestFlight build number
- tester group
- submission date
- release notes used
- known issues used

### Acceptance Criteria

- TestFlight state is visible in the admin console
- release notes are generated from stored client data and build metadata

## Phase 8: Optional Apple Automation

Only after Phases 0 through 7 are stable, consider:

- App Store Connect app creation
- metadata population
- tester assignment
- production submission

Do not start here.

This is the highest-complexity integration and should come last.

## Recommended Implementation Order

Highest ROI order:

1. persist mobile release profile in backend
2. add admin-console mobile release screen
3. generate `.env.beta` and `.env.production`
4. unify validation with the mobile CLI validator
5. add release readiness tracking
6. trigger EAS beta build from the console

## Suggested File-Level Work Areas

### Contracts And Data Model

- `packages/contracts/catalog/src/index.ts`
- `services/catalog/src/repository.ts`
- `packages/persistence/src/migrations/...`

### Shared Generator Package

- `packages/mobile-release-config/src/index.ts`
- `apps/mobile/scripts/validate-release-env.mjs`

### Admin Console API Wiring

- `apps/admin-console/src/lib/internal-api.ts`
- `apps/admin-console/src/app/actions.ts`

### Admin Console Screens

- `apps/admin-console/src/app/(console)/clients/new/page.tsx`
- new routes under `apps/admin-console/src/app/(console)/clients/[locationId]/mobile-release`

### Build Automation

- `.github/workflows/mobile-client-release.yml`

## V1 Acceptance Criteria

For the first implementation of this feature, a new client should be able to go through all of this from the admin console:

- create client, location, and owner
- fill branded mobile release metadata
- view generated beta and production env payloads
- validate those payloads
- see what Apple identifiers still need to be created
- track whether beta, TestFlight, production, and live release steps are complete

No local shell editing should be required to prepare the release profile. Build triggering can follow in the next phase.
