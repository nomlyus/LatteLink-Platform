# Mobile Screen Variant Plan

Last updated: `2026-04-09`

## Purpose

This document defines how the mobile app will support multiple UI implementations for the same screen while keeping bundle size under control and preserving strict rollout safety.

The core requirement is:

- multiple variants can exist for a screen such as `home_v1` and `home_v2`
- runtime config chooses which variant a tenant/location should use
- a given app build should only ship the variants that build is meant to support
- if config asks the client to load a variant that is not present in the build, the client must show a hard error
- newer config must not be served to older builds that cannot support it

This plan is intentionally stricter than a normal feature-flag system. A screen variant is treated as part of the product contract for a tenant, not as a best-effort experiment.

## Goals

- support multiple UI variants per screen
- allow config-driven selection of those variants
- avoid shipping every possible variant in every binary
- prevent silent client fallback
- gate new screen variants by build track and minimum build number
- keep screen state and business logic shared where possible
- move the platform closer to true tenant-aware presentation

## Non-Goals

- server-driven arbitrary UI trees
- downloading executable screen code at runtime
- replacing native build-time tenant identity such as bundle ID, app name, icons, Apple Pay entitlements, or associated domains
- making the public mobile APIs fully tenant-aware in the same phase as the first screen-variant pilot

## Current State

The current repo already has the beginnings of tenant-aware runtime config, but it is not yet enough to support safe variant delivery.

### Existing Config Split

- `storeConfig` is operational state such as hours, ETA, tax, and pickup instructions in [`packages/contracts/catalog/src/index.ts`](../../packages/contracts/catalog/src/index.ts#L271)
- `appConfig` is presentation/runtime capability state such as brand, theme, tabs, payment capabilities, and store capabilities in [`packages/contracts/catalog/src/index.ts`](../../packages/contracts/catalog/src/index.ts#L565)

### Existing Tenant Foundations

- catalog already supports internal multi-location provisioning and listing in [`services/catalog/src/repository.ts`](../../services/catalog/src/repository.ts#L1062)
- app config defaults are resolved in [`services/catalog/src/tenant.ts`](../../services/catalog/src/tenant.ts)

### Current Mobile and Public API Limits

- the mobile SDK fetches public config without client build metadata in [`packages/sdk-mobile/src/index.ts`](../../packages/sdk-mobile/src/index.ts#L152)
- public `getAppConfig()` still resolves the default location only in [`services/catalog/src/repository.ts`](../../services/catalog/src/repository.ts#L1047)
- public `getStoreConfig()` also resolves the default location only in [`services/catalog/src/repository.ts`](../../services/catalog/src/repository.ts#L1812)
- the mobile UI uses static palette values in [`apps/mobile/src/ui/system.tsx`](../../apps/mobile/src/ui/system.tsx#L20)

### Current Build and Versioning Shape

- Expo config exposes app version in [`apps/mobile/app.config.ts`](../../apps/mobile/app.config.ts#L73)
- iOS runtime version is currently fixed at `1.0.0` in [`apps/mobile/app.config.ts`](../../apps/mobile/app.config.ts#L96)
- EAS uses separate `internal`, `beta`, and `production` build profiles in [`apps/mobile/eas.json`](../../apps/mobile/eas.json)
- iOS build number currently exists as `CFBundleVersion` in [`apps/mobile/ios/LatteLinkBeta/Info.plist`](../../apps/mobile/ios/LatteLinkBeta/Info.plist#L37)

## High-Level Design

The system has four moving parts:

1. configuration tells the app which screen variant is required
2. the build manifest tells the app which variants are actually present in that binary
3. the server uses build metadata to avoid sending incompatible config to older builds
4. the client validates the returned variant against the build manifest and hard-fails on mismatch

The rule is:

- build-time decides what exists
- runtime config decides what to use
- mismatch is an error

## Proposed Data Model

### Public App Config

Public `appConfig` should gain a resolved `experience` block:

```ts
experience: {
  screens: {
    home: "home_v1",
    menu: "menu_v1",
    checkout: "checkout_v1",
    account: "account_v1"
  }
}
```

This is the shape the mobile app should receive after server-side compatibility resolution.

### Internal Rollout Model

The server needs a richer internal rollout model than the public response. The recommended internal representation is:

```ts
type ScreenRolloutRule = {
  screenId: "home" | "menu" | "checkout" | "account";
  variantId: string;
  appVariant: "internal" | "beta" | "production";
  minBuildNumber: number;
};
```

Example:

```ts
[
  { screenId: "home", variantId: "home_v1", appVariant: "beta", minBuildNumber: 1 },
  { screenId: "home", variantId: "home_v2", appVariant: "beta", minBuildNumber: 42 },
  { screenId: "home", variantId: "home_v3", appVariant: "internal", minBuildNumber: 130 }
]
```

Resolution rule:

- filter rules to the current `screenId`
- filter rules to the client `appVariant`
- filter rules where `minBuildNumber <= clientBuildNumber`
- choose the rule with the highest `minBuildNumber`
- if none match, return a compatibility error

This is not client fallback. It is explicit server-side compatibility targeting.

## Why Build Track Matters

`minBuildNumber` alone is not enough. This repo already ships separate `internal`, `beta`, and `production` profiles in [`apps/mobile/eas.json`](../../apps/mobile/eas.json). Different tracks may carry different variant packs, and build numbers are not guaranteed to be globally comparable across those tracks.

Because of that, rollout rules must be keyed by both:

- `appVariant`
- `minBuildNumber`

The tuple `(appVariant, buildNumber)` is the compatibility key.

## Build Manifest Strategy

To reduce bundle size, the build must declare exactly which variants are included before Metro bundles the app.

The recommended approach is:

- create a pack file per build profile
- generate a manifest file and registry file before build
- only import the variants declared by that pack

Recommended pack files:

- `apps/mobile/experience-packs/internal.json`
- `apps/mobile/experience-packs/beta.json`
- `apps/mobile/experience-packs/production.json`

Example pack file:

```json
{
  "home": ["home_v1", "home_v2"],
  "menu": ["menu_v1"],
  "checkout": ["checkout_v1"],
  "account": ["account_v1"]
}
```

Generated files:

- `apps/mobile/src/experience/generated/manifest.ts`
- `apps/mobile/src/experience/generated/registry.ts`

`manifest.ts` should describe what the build contains:

```ts
export const buildExperienceManifest = {
  appVariant: "beta",
  screens: {
    home: ["home_v1", "home_v2"],
    menu: ["menu_v1"],
    checkout: ["checkout_v1"],
    account: ["account_v1"]
  }
} as const;
```

`registry.ts` should import only those variants:

```ts
import { HomeV1 } from "../screens/home/home_v1";
import { HomeV2 } from "../screens/home/home_v2";

export const screenRegistry = {
  home: {
    home_v1: HomeV1,
    home_v2: HomeV2
  }
} as const;
```

This generated registry is what keeps unused variants out of the bundle.

## Mobile Runtime Architecture

Each screen should be split into:

- a shared container for data fetching, mutation calls, derived state, and navigation
- one or more presentational variants

Recommended structure:

- `apps/mobile/src/experience/`
- `apps/mobile/src/experience/generated/manifest.ts`
- `apps/mobile/src/experience/generated/registry.ts`
- `apps/mobile/src/experience/provider.tsx`
- `apps/mobile/src/experience/resolver.ts`
- `apps/mobile/src/experience/errors.ts`
- `apps/mobile/src/experience/ErrorScreen.tsx`
- `apps/mobile/src/experience/screens/home/home_v1.tsx`
- `apps/mobile/src/experience/screens/home/home_v2.tsx`
- `apps/mobile/src/experience/screens/checkout/checkout_v1.tsx`
- `apps/mobile/src/screens/home/HomeScreenContainer.tsx`

The current screen files should become thin selectors or containers. For example:

- [`apps/mobile/src/screens/HomeScreen.tsx`](../../apps/mobile/src/screens/HomeScreen.tsx) becomes the resolver entry point for home
- [`apps/mobile/app/checkout.tsx`](../../apps/mobile/app/checkout.tsx) becomes the resolver entry point for checkout

### Client Resolution Flow

When a screen loads:

1. read resolved `appConfig.experience.screens.home`
2. resolve `home_v2`
3. confirm `home_v2` exists in `buildExperienceManifest`
4. load the registered component from `screenRegistry`
5. if missing, throw `MissingScreenVariantError`
6. render a blocking mismatch screen instead of falling back

The client must never substitute another variant automatically.

## Error Behavior

### Server-Side Compatibility Error

If the server cannot find a rollout rule compatible with the current `(appVariant, buildNumber)` for a required screen, `GET /v1/app-config` should fail with a dedicated error such as:

- `APP_CONFIG_INCOMPATIBLE_WITH_CLIENT_BUILD`

This is an operational release/config error, not a user-correctable problem.

### Client-Side Build Mismatch Error

If the client receives a resolved variant ID that is not present in the local build manifest, the app should show a blocking error surface with:

- screen ID
- requested variant ID
- build app variant
- build number
- location or tenant identifiers if available

The client should also log structured telemetry for this event.

## Exact Implementation Plan

### 1. Contracts

Files:

- [`packages/contracts/catalog/src/index.ts`](../../packages/contracts/catalog/src/index.ts)

Changes:

- add `screenIdSchema`
- add public `appConfigExperienceSchema`
- add internal/admin rollout schemas for versioned screen assignments
- extend `appConfigSchema` to include resolved `experience`
- export new `Experience` and `ScreenRolloutRule` types
- extend any internal location or admin schemas that need to show or edit rollout rules

Recommended public type:

```ts
type AppExperience = {
  screens: Record<"home" | "menu" | "checkout" | "account", string>;
};
```

Recommended internal type:

```ts
type ScreenRolloutRule = {
  screenId: ScreenId;
  variantId: string;
  appVariant: "internal" | "beta" | "production";
  minBuildNumber: number;
};
```

### 2. Persistence

Recommended approach:

- add a dedicated table such as `catalog_screen_experience_rollouts`

Recommended columns:

- `brand_id`
- `location_id`
- `screen_id`
- `variant_id`
- `app_variant`
- `min_build_number`
- `created_at`
- `updated_at`

Recommended uniqueness:

- unique on `(brand_id, location_id, screen_id, app_variant, min_build_number)`

Why a separate table is preferred over raw JSON in `catalog_app_configs.app_config_json`:

- versioned rollout rules are first-class platform data
- querying and validation become easier
- rollout history is clearer
- public `appConfig` can stay a resolved contract rather than a schedule blob

Files:

- [`packages/persistence/src/index.ts`](../../packages/persistence/src/index.ts)
- [`services/catalog/src/repository.ts`](../../services/catalog/src/repository.ts)

### 3. Catalog Service

Files:

- [`services/catalog/src/tenant.ts`](../../services/catalog/src/tenant.ts)
- [`services/catalog/src/repository.ts`](../../services/catalog/src/repository.ts)
- [`services/catalog/src/routes.ts`](../../services/catalog/src/routes.ts)

Changes:

- define a default resolved experience in `tenant.ts`
- define default rollout rules for the default tenant/location
- teach `getAppConfig()` to accept client compatibility context
- resolve screen rollouts to a single public `experience` object before returning
- add internal/admin read and write paths for rollout rule management

Recommended repository signature:

```ts
getAppConfig(client: {
  appVariant: "internal" | "beta" | "production";
  buildNumber: number;
  platform: "ios" | "android";
}): Promise<AppConfig>
```

### 4. Gateway and SDK

Files:

- [`services/gateway/src/routes.ts`](../../services/gateway/src/routes.ts)
- [`packages/sdk-mobile/src/index.ts`](../../packages/sdk-mobile/src/index.ts)
- [`apps/mobile/src/api/client.ts`](../../apps/mobile/src/api/client.ts)

Changes:

- add client metadata headers for config requests
- gateway forwards those headers unchanged to catalog
- SDK supports default request headers or a header provider
- mobile client populates those headers from native/runtime values

Recommended headers:

- `x-client-platform`
- `x-client-app-variant`
- `x-client-build-number`
- `x-client-app-version`
- `x-client-runtime-version`

The mobile client will likely need `expo-application` added so it can read:

- native build number
- native app version

`appVariant` can continue to come from Expo `extra` in [`apps/mobile/app.config.ts`](../../apps/mobile/app.config.ts#L106).

### 5. Mobile Build Pipeline

Files:

- [`apps/mobile/app.config.ts`](../../apps/mobile/app.config.ts)
- [`apps/mobile/eas.json`](../../apps/mobile/eas.json)
- [`apps/mobile/package.json`](../../apps/mobile/package.json)
- new `apps/mobile/scripts/generate-screen-registry.mjs`

Changes:

- add an env like `UI_PACK=internal|beta|production`
- before build, generate the manifest and registry files from the selected pack
- wire the generator into `prebuild`, `dev`, and CI/release workflows
- internal builds can include more variants
- production builds can include only approved variants

### 6. Mobile Runtime Layer

Files:

- [`apps/mobile/app/_layout.tsx`](../../apps/mobile/app/_layout.tsx)
- new `apps/mobile/src/experience/*`
- affected screen files such as:
  - [`apps/mobile/src/screens/HomeScreen.tsx`](../../apps/mobile/src/screens/HomeScreen.tsx)
  - [`apps/mobile/app/checkout.tsx`](../../apps/mobile/app/checkout.tsx)
  - [`apps/mobile/src/screens/MenuScreen.tsx`](../../apps/mobile/src/screens/MenuScreen.tsx)
  - [`apps/mobile/src/screens/AccountScreen.tsx`](../../apps/mobile/src/screens/AccountScreen.tsx)

Changes:

- add `ExperienceProvider` in `_layout.tsx`
- add `useExperience()` hook
- add screen resolver helpers
- introduce a dedicated blocking error screen for missing screen variants
- split screen logic from screen presentation

### 7. Admin and Internal Provisioning

Files:

- [`services/catalog/src/routes.ts`](../../services/catalog/src/routes.ts)
- [`services/catalog/src/repository.ts`](../../services/catalog/src/repository.ts)
- any future admin-console client paths that edit tenant config

Changes:

- internal location bootstrap must either:
  - create default rollout rules, or
  - inherit a default experience pack
- internal/admin APIs must support editing rollout rules safely
- edit validation should reject duplicate or contradictory rules

### 8. Observability

Every mismatch or compatibility failure should log:

- `screenId`
- `requestedVariantId`
- `appVariant`
- `buildNumber`
- `appVersion`
- `runtimeVersion`
- `locationId`
- `brandId`

Recommended error codes:

- `APP_CONFIG_INCOMPATIBLE_WITH_CLIENT_BUILD`
- `MISSING_SCREEN_VARIANT_IN_BUILD`
- `INVALID_SCREEN_ROLLOUT_CONFIGURATION`

## Rollout Procedure

The required release order is:

1. implement a new screen variant and add it to the intended build pack
2. ship the new build
3. wait until the targeted track has reached the required minimum build adoption
4. create or update rollout rules for that screen and track
5. confirm the server is returning the correct resolved variant
6. monitor mismatch and compatibility errors

The server-side rule table is what prevents older builds from moving onto incompatible config.

## Phased Delivery

### Phase 1: Home Pilot

- add public `experience` to `appConfig`
- add rollout table and resolution logic
- add client build metadata headers
- add build pack generation and registry generation
- split only Home into `container + variants`
- ship `home_v1` and `home_v2` in internal or beta only

Why start here:

- Home is high-visibility
- it proves the architecture
- it avoids entangling payment or cart logic on the first pass

### Phase 2: Checkout

- move checkout to the same resolver pattern
- harden error surfaces and telemetry
- validate that the no-fallback policy works operationally

### Phase 3: Menu and Account

- convert remaining major presentation surfaces
- make variant definitions routine rather than custom

### Phase 4: Runtime Theme and Assets

- replace static palette assumptions in [`apps/mobile/src/ui/system.tsx`](../../apps/mobile/src/ui/system.tsx#L20) with runtime theme resolution
- allow variant families to share tenant-specific colors and typography more cleanly

### Phase 5: Public Tenant-Aware Config

- stop serving only default location config on public mobile paths
- resolve `appConfig` and `storeConfig` by real tenant/location selection rather than default constants

## Consequences

### Benefits

- per-tenant or per-location UI can be rolled out safely
- build size remains more controlled than shipping every variant everywhere
- rollout mistakes are surfaced clearly instead of being silently hidden
- the platform gains a first-class experience-delivery layer

### Costs

- more moving parts across contracts, persistence, catalog, gateway, mobile, and release pipelines
- stricter operational discipline is required
- QA matrix grows significantly
- admin validation becomes important
- build profile and track coordination become part of product delivery

### Operational Risk

Because there is no client fallback, a bad rollout rule or a bad build manifest can break a screen for a tenant. That is intentional, but it means:

- rollout tooling must validate before publish
- internal QA must check resolved variants against a real build
- telemetry must be in place before broad rollout

## Assessment Against Multi-Tenant Platform Goals

### How This Moves the Platform Closer

This work moves the repo closer to a multi-tenant platform because:

- tenant presentation becomes a first-class configured capability
- per-location experience no longer has to be hardcoded in mobile
- rollout safety becomes part of the platform contract
- future tenant-specific theming and layout families have a place to live

### Where This Does Not Go Far Enough

This plan does not complete the multi-tenant platform on its own.

Remaining gaps:

- public mobile config still resolves default location today in [`services/catalog/src/repository.ts`](../../services/catalog/src/repository.ts#L1047) and [`services/catalog/src/repository.ts`](../../services/catalog/src/repository.ts#L1812)
- the mobile app does not yet identify a tenant/location on public config reads
- runtime theme is still mostly static
- native shell identity is still build-time
- payment identifiers and other native capabilities are not solved by screen variants

### Net Assessment

This plan is a good step toward a multi-tenant platform if the target is:

- one shared platform
- multiple tenant experiences
- controlled per-track rollout of those experiences

This plan is not enough if the target is:

- a single universal customer binary that fully rebrands itself for arbitrary tenants at runtime

That larger goal still requires:

- real public tenant resolution
- runtime theming and assets
- a clear native-shell strategy

## Expo Updates Consequence

This plan interacts directly with Expo Updates.

Because the set of included screen variants becomes build-dependent, runtime versioning must be treated more carefully than it is today. iOS currently uses a fixed runtime version in [`apps/mobile/app.config.ts`](../../apps/mobile/app.config.ts#L96).

Before relying on build-specific variant packs with OTA delivery, one of the following must happen:

- runtime version becomes aligned with app version or another compatibility key that changes when the pack changes
- OTA is restricted so incompatible builds cannot receive bundles generated from a different variant pack

Without that change, OTA updates can undermine the build-manifest guarantees this plan depends on.

## Recommended First Implementation

The first implementation should be:

- Home only
- internal or beta track only
- separate rollout table
- generated manifest and registry
- server-side `(appVariant, minBuildNumber)` gating
- client hard error on missing variant

This is the smallest slice that proves the system honestly.

## Future Follow-Up Documents

After implementation begins, create or update:

- a runbook for publishing new screen rollouts
- a QA checklist for variant/build compatibility
- a build/runbook note covering pack generation and runtime versioning
