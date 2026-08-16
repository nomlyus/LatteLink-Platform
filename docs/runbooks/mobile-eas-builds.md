# Mobile EAS Build Matrix

Last updated: `2026-08-16`

## Purpose

This runbook defines the required environment inputs and EAS profiles for `apps/mobile`.

Use it when creating:

- TestFlight beta builds
- production App Store candidates
- OTA updates with EAS Update

## OTA-First Release Policy

Prefer an EAS Update over a new binary whenever the change is limited to JavaScript, TypeScript, CSS,
bundled non-native assets, generated contracts, design tokens, or the mobile SDK package.

Create a new binary only when the release changes native runtime behavior or store metadata, including:

- `apps/mobile/ios/**`
- `apps/mobile/android/**`
- native Expo config or EAS profile changes in `app.config.ts` or `eas.json`
- dependency changes in `apps/mobile/package.json`, root `package.json`, `pnpm-lock.yaml`, or workspace package manifests
- app icon, splash screen, bundle identifier, entitlements, Apple Pay, notification, or associated-domain configuration
- Expo SDK, React Native, native module, CocoaPods, or Gradle changes

Run the classifier before deciding the release path. It compares file content between the two refs:

```bash
pnpm --filter @lattelink/mobile release:classify origin/main HEAD
```

Exit codes:

- `0`: no binary build required by the classifier; OTA may be enough after normal QA
- `2`: binary build required

The iOS `runtimeVersion` is intentionally independent from the App Store `APP_VERSION`. Keep
`APP_RUNTIME_VERSION` unchanged for OTA-compatible changes. Advance `APP_RUNTIME_VERSION` only when a
native/config/dependency change requires a new runtime and a new binary.

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

- `APP_RUNTIME_VERSION`
  - defaults to the current native runtime line
  - keep stable across OTA-only releases
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

## Merchant-Specific Build Preparation

For a new merchant app, do not hand-edit `apps/mobile/eas.json` for every client. Generate a merchant
build bundle from the approved app identity profile, then use the generated commands as the auditable
handoff into EAS.

Create a merchant manifest with the approved identity and release values:

```json
{
  "locationId": "rawaqcoffee01",
  "appName": "Rawaq",
  "displayName": "Rawaq",
  "bundleIdentifier": "com.lattelink.rawaq.beta",
  "sku": "rawaq-ios-beta",
  "applePayMerchantId": "merchant.com.lattelink.rawaq.beta",
  "ascAppId": "6761780971",
  "apiBaseUrl": "https://api-dev.nomly.us/v1",
  "appVersion": "1.0.10",
  "runtimeVersion": "1.0.10",
  "sentryDsn": "https://<public-key>@<org>.ingest.sentry.io/<project>",
  "sentryOrg": "nomly",
  "sentryProject": "mobile",
  "targetLocationIds": ["rawaqcoffee01"],
  "releaseNotes": "Performance optimizations, security updates, and reliability improvements."
}
```

Prepare the build bundle from the exact source commit recorded in the internal admin release panel:

```bash
pnpm --filter @lattelink/mobile merchant-build:prepare -- \
  --input ./merchant.json \
  --profile beta \
  --source-commit <40-character-git-sha>
```

The script writes generated artifacts under `.nomly/mobile-builds/<locationId>/<profile>/`:

- `.env.eas`: release environment for `app.config.ts`
- `build-manifest.json`: source commit, config hash, bundle identifier, App Store Connect app ID, and commands
- `commands.sh`: preflight, App Store Connect integration, build, and submit commands

Run the generated `preflight` command before any build. If `ascAppId` is present, run the generated
`eas integrations:asc:connect` command before submission so EAS Submit targets the correct App Store
Connect app for that merchant. Then run the generated build and submit commands.

Use `--execute preflight`, `--execute build`, `--execute submit`, or `--execute all` only after checking
the generated manifest. The default mode only writes the bundle and does not call EAS.

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
pnpm --filter @lattelink/mobile update:beta -- --message "<release note>"
pnpm --filter @lattelink/mobile update:production -- --message "<release note>"
```

Before publishing production OTA updates:

- the exact commit should already be tested on `develop`/`beta`
- the classifier should not report binary-required files
- the current production binary must have the same `APP_RUNTIME_VERSION`
- use a clear customer-safe update message, for example `Performance optimizations and reliability improvements`

## TestFlight Checklist

Before creating a `beta` or `production` build:

- run `pnpm --filter @lattelink/mobile release:classify origin/main HEAD`
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
