# Mobile EAS Build Matrix

Last updated: `2026-04-01`

## Purpose

This runbook defines the required environment inputs and EAS profiles for `apps/mobile`.

Use it when creating:

- internal device builds
- TestFlight beta builds
- production App Store candidates

## Profiles

The mobile app now uses `apps/mobile/eas.json` with three profiles:

- `internal`
  - distribution: `internal`
  - intended backend: local tunnel, dev, or pilot sandbox
  - default variant: `APP_VARIANT=internal`
- `beta`
  - distribution: `store`
  - intended backend: pilot environment
  - default variant: `APP_VARIANT=beta`
- `production`
  - distribution: `store`
  - intended backend: production environment
  - default variant: `APP_VARIANT=production`

## Required Environment Values

Use [apps/mobile/.env.example](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/apps/mobile/.env.example) as the canonical shape.

For release preparation and TestFlight handoff, continue with:

- [mobile-testflight-pilot-release.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-testflight-pilot-release.md)

Required values for every build:

- `APP_VARIANT`
- `APP_DISPLAY_NAME_BASE`
- `APP_VERSION`
- `EXPO_SLUG`
- `EXPO_SCHEME`
- `IOS_BUNDLE_IDENTIFIER`
- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID`
- `EXPO_PUBLIC_BRAND_NAME`

Optional values:

- `IOS_ASSOCIATED_DOMAINS`
- `EXPO_PUBLIC_CATALOG_SERVICE_BASE_URL`
- `EXPO_PUBLIC_CATALOG_API_BASE_URL`
- `EXPO_PUBLIC_PRIVACY_POLICY_URL`
  - defaults to `https://lattelink.da0ud.me/privacy-policy`
  - set it only if a tenant or release needs a different public policy URL

## Recommended Matrix

### Internal

- `APP_VARIANT=internal`
- `APP_DISPLAY_NAME_BASE=LatteLink`
- `IOS_BUNDLE_IDENTIFIER=com.lattelink.mobile.internal`
- `EXPO_PUBLIC_API_BASE_URL=<local tunnel or dev backend>/v1`
- `EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID=<dev or sandbox merchant id>`

### Beta

- `APP_VARIANT=beta`
- `APP_DISPLAY_NAME_BASE=LatteLink`
- `IOS_BUNDLE_IDENTIFIER=com.lattelink.mobile.beta`
- `EXPO_PUBLIC_API_BASE_URL=<pilot backend>/v1`
- `EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID=<pilot merchant id>`

### Production

- `APP_VARIANT=production`
- `APP_DISPLAY_NAME_BASE=LatteLink`
- `IOS_BUNDLE_IDENTIFIER=com.lattelink.mobile`
- `EXPO_PUBLIC_API_BASE_URL=<production backend>/v1`
- `EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID=<production merchant id>`

## Build Commands

Run from `apps/mobile` or use `pnpm --filter @lattelink/mobile exec ...`.

Before starting a build, run the release preflight for the intended profile:

```bash
pnpm --filter @lattelink/mobile release:check -- internal
pnpm --filter @lattelink/mobile release:check -- beta
pnpm --filter @lattelink/mobile release:check -- production
```

The preflight validates that the env is complete and catches common mistakes such as:

- missing API base URL
- wrong bundle identifier for the profile
- `beta` or `production` pointing to localhost or non-HTTPS API URLs
- malformed Apple Pay merchant identifiers
- missing or invalid in-app privacy policy URLs

Then run the actual EAS build:

```bash
eas build --platform ios --profile internal
eas build --platform ios --profile beta
eas build --platform ios --profile production
```

## TestFlight Checklist

Before creating a `beta` or `production` build:

- run `pnpm --filter @lattelink/mobile release:check -- <profile>`
- confirm the target API base URL is correct
- confirm the Apple Pay merchant identifier matches the target environment
- confirm the privacy policy URL is live and public
- confirm the bundle identifier matches the provisioning target
- confirm the app display name matches the intended lane
- confirm the build profile matches the destination

## Notes

- Internal builds are allowed to target a local tunneled API before backend production is deployed.
- Beta and production should never rely on placeholder or localhost API values.
- The Expo config now derives app name, bundle identifier, scheme, and EAS metadata from environment input instead of hardcoded repo defaults.
