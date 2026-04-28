# Mobile TestFlight Pilot Release

Last updated: `2026-04-23`

## Purpose

Use this runbook to prepare, build, validate, and hand off the first controlled TestFlight pilot build for `apps/mobile`.

This is the release wrapper around:

- [mobile-eas-builds.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-eas-builds.md)
- [mobile-pilot-purchase-flow-qa.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-pilot-purchase-flow-qa.md)

## Preconditions

Before cutting a TestFlight candidate:

- `MF-V1-01` through `MF-V1-04` are complete on the branch being released
- the target backend environment is live and reachable
- the mobile profile env values are set correctly for `beta`
- Apple Pay merchant configuration matches the target environment
- at least one real-device QA pass has been completed with the target backend

## Build Profile

Use:

- `profile`: `beta`
- `distribution`: `store`
- `target`: TestFlight

Reference values are defined in:

- [apps/mobile/eas.json](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/apps/mobile/eas.json)
- [apps/mobile/.env.example](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/apps/mobile/.env.example)

## Release Checklist

### Build Inputs

- run `pnpm --filter @lattelink/mobile release:check -- beta`
- confirm `APP_VARIANT=beta`
- confirm `IOS_BUNDLE_IDENTIFIER` matches the pilot TestFlight app
- confirm `EXPO_PUBLIC_API_BASE_URL` points to `https://api-dev.nomly.us/v1`
- confirm `EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID` matches the pilot merchant setup
- confirm `EXPO_PUBLIC_BRAND_NAME` matches the client-facing pilot branding

### QA Gate

Run the full checklist in:

- [mobile-pilot-purchase-flow-qa.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/mobile-pilot-purchase-flow-qa.md)

Do not submit a build if:

- menu/config outage behavior is still misleading or still falls back to localhost
- checkout fails without a recoverable path
- order confirmation and Orders disagree on the final order state

### Distribution

- upload the `beta` build to TestFlight
- assign only the intended pilot testers
- include the release notes and known issues list below

## External Setup Matrix

These values must line up across Expo, Apple, and the pilot environment before the first live TestFlight build:

| Surface | Value | Notes |
| --- | --- | --- |
| Expo/EAS | `APP_VARIANT=beta` | comes from the `beta` profile in [apps/mobile/eas.json](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/apps/mobile/eas.json) |
| Expo/EAS | `IOS_BUNDLE_IDENTIFIER` | should match the App Store Connect pilot app record |
| Expo/EAS | `EXPO_PUBLIC_API_BASE_URL` | must be the public pilot backend URL ending in `/v1` |
| Expo/EAS | `EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID` | must match the Apple Pay merchant configured for the pilot |
| App Store Connect | bundle identifier | should match the EAS `beta` bundle identifier exactly |
| Apple Developer | Merchant ID | must match the value used in Expo env |
| Apple Developer | Associated domains | should match the pilot auth/API domain setup when enabled |

Recommended first pilot mapping:

- `APP_VARIANT=beta`
- `IOS_BUNDLE_IDENTIFIER=com.lattelink.rawaq.beta`
- `EXPO_PUBLIC_API_BASE_URL=https://api-dev.nomly.us/v1`
- `EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID=merchant.com.lattelink.rawaq.beta`

## Release Notes Template

Copy this into the TestFlight build notes:

```md
## LatteLink Pilot Build

Build profile: `beta`
Backend environment: `<environment name>`
Build date: `YYYY-MM-DD`
Commit: `<git sha>`

### What to Test
- sign in
- browse menu
- customize an item
- complete a purchase
- track the order in Orders

### Focus Areas
- checkout reliability
- order status clarity
- account/session stability

### Feedback
- report the screen, timestamp, and exact action that triggered the issue
- include screenshot or screen recording when possible
```

## Known Issues Template

Track pilot-visible issues in this format:

| Severity | Area | Symptom | Workaround | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| `P0/P1/P2` | `auth/cart/orders/etc.` | `issue description` | `user-facing workaround` | `owner` | `open/fixed/monitoring` |

Seed the list before release, even if empty:

- `No known pilot-blocking issues at build cut time.`

## Feedback Loop

For each pilot report, capture:

- device model and iOS version
- build number
- account used
- order ID or pickup code if relevant
- approximate timestamp
- screenshot or recording if available
- whether the issue blocks ordering, tracking, or only polish

Recommended triage buckets:

- `P0` cannot sign in or cannot order
- `P1` order completed but state is confusing or unreliable
- `P2` polish or low-risk usability issue

## Rollback Plan

If the pilot build is not safe:

1. stop onboarding new testers to the bad build
2. tell existing testers to stop using the affected build
3. if the issue is backend-driven, roll back or stabilize the backend first
4. cut a replacement `beta` build with a new build number
5. update release notes with the issue and the replacement build reference

If the issue is limited to backend configuration and the mobile binary itself is still sound:

- prefer backend rollback or config rollback first
- only replace the mobile build if the binary contains the defect

## External Actions Still Required

The following cannot be completed from the repo alone:

- EAS project setup and authentication
- Apple Developer / App Store Connect credentials
- TestFlight app record and tester management
- final build submission to TestFlight
