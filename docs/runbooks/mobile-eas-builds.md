# Mobile EAS Build Matrix

Last updated: `2026-04-23`

## Purpose

This runbook defines the required environment inputs and EAS profiles for `apps/mobile`.

Use it when creating:

- TestFlight beta builds
- production App Store candidates

## Profiles

The mobile app now uses `apps/mobile/eas.json` with two profiles:

- `beta`
  - distribution: `store`
  - intended backend: `dev`
  - default variant: `APP_VARIANT=beta`
  - repo default API target: `https://api-dev.nomly.us/v1`
- `production`
  - distribution: `store`
  - intended backend: production environment
  - default variant: `APP_VARIANT=production`
  - repo default API target: `https://api.nomly.us/v1`

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
  - defaults to `https://nomly.us/privacy-policy`
  - set it only if a tenant or release needs a different public policy URL

## Recommended Matrix

### Beta

- `APP_VARIANT=beta`
- `APP_DISPLAY_NAME_BASE=Rawaq`
- `IOS_BUNDLE_IDENTIFIER=com.lattelink.rawaq.beta`
- `EXPO_PUBLIC_API_BASE_URL=https://api-dev.nomly.us/v1`
- `EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID=merchant.com.lattelink.rawaq.beta`

### Production

- `APP_VARIANT=production`
- `APP_DISPLAY_NAME_BASE=Rawaq`
- `IOS_BUNDLE_IDENTIFIER=com.lattelink.rawaq`
- `EXPO_PUBLIC_API_BASE_URL=https://api.nomly.us/v1`
- `EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID=merchant.com.lattelink.rawaq`
- App Store Connect app ID: `6764649231`

## Build Commands

Run from `apps/mobile` or use `pnpm --filter @lattelink/mobile exec ...`.

Before starting a build, run the release preflight with the same EAS environment the build/update will use:

```bash
pnpm --filter @lattelink/mobile exec eas env:exec preview "pnpm release:check -- beta" --non-interactive
pnpm --filter @lattelink/mobile exec eas env:exec production "pnpm release:check -- production" --non-interactive
```

The preflight validates that the env is complete and catches common mistakes such as:

- missing API base URL
- falling back to a repo-local or localhost API target
- wrong bundle identifier for the profile
- `beta` or `production` pointing to localhost or non-HTTPS API URLs
- malformed Apple Pay merchant identifiers
- missing or invalid in-app privacy policy URLs
- missing Sentry DSN or org/project slug

`SENTRY_AUTH_TOKEN` should exist as an EAS `secret` variable. EAS does not expose secret values to `eas env:exec`, so
the preflight warns when it cannot see the token. Verify the secret exists before building:

```bash
pnpm --filter @lattelink/mobile exec eas env:list preview --format long
```

Then run the actual EAS build:

```bash
eas build --platform ios --profile beta
eas build --platform ios --profile production
```

The EAS environment is selected by the `environment` field in [apps/mobile/eas.json](../../apps/mobile/eas.json).

For OTA updates, use the matching channel and EAS environment. The beta channel uses EAS's default `preview`
environment because custom EAS environments require a paid Expo plan; production uses EAS `production`.

```bash
eas update --channel beta --environment preview --message "<release note>"
eas update --channel production --environment production --message "<release note>"
```

## TestFlight Checklist

Before creating a `beta` or `production` build:

- run the matching EAS env-backed release preflight
- confirm the target API base URL is correct
- confirm the Apple Pay merchant identifier matches the target environment
- confirm Sentry is configured and `SENTRY_AUTH_TOKEN` is present as an EAS secret
- confirm the privacy policy URL is live and public
- confirm the bundle identifier matches the provisioning target
- confirm the app display name matches the intended lane
- confirm the build profile matches the destination

## Notes

- Beta and production should never rely on placeholder or localhost API values.
- The Expo config now derives app name, bundle identifier, scheme, and EAS metadata from environment input instead of hardcoded repo defaults.
