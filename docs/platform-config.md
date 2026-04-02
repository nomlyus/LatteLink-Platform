# Platform Config

Last updated: `2026-03-20`

## Purpose

This repo now exposes a runtime app-config contract so the mobile app and backend can stop relying on hardcoded brand assumptions.

The current implementation is additive:

- existing menu and store config behavior remains unchanged
- the catalog service owns `GET /v1/app-config`
- the gateway now proxies `GET /v1/app-config`
- the mobile app and operator web app read runtime config when available and fall back to local defaults if the endpoint is unavailable

## App Config Contract

Shared schema:

- [`packages/contracts/catalog/src/index.ts`](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/packages/contracts/catalog/src/index.ts)

Current response shape:

- `brand`
  - `brandId`
  - `brandName`
  - `locationId`
  - `locationName`
  - `marketLabel`
- `theme`
  - `background`
  - `backgroundAlt`
  - `surface`
  - `surfaceMuted`
  - `foreground`
  - `foregroundMuted`
  - `muted`
  - `border`
  - `primary`
  - `accent`
  - `fontFamily`
  - `displayFontFamily`
- `enabledTabs`
- `featureFlags`
  - `loyalty`
  - `pushNotifications`
  - `refunds`
  - `orderTracking`
  - `staffDashboard`
  - `menuEditing`
- `loyaltyEnabled`
- `storeCapabilities`
  - `menu.source`
    - `platform_managed`
    - `external_sync`
  - `operations.fulfillmentMode`
    - `staff`
    - `time_based`
  - `operations.liveOrderTrackingEnabled`
  - `operations.dashboardEnabled`
  - `loyalty.visible`
- `paymentCapabilities`
  - `applePay`
  - `card`
  - `cash`
  - `refunds`
  - `clover.enabled`
  - `clover.merchantRef`
- `fulfillment`
  - `mode`
  - `timeBasedScheduleMinutes.inPrep`
  - `timeBasedScheduleMinutes.ready`
  - `timeBasedScheduleMinutes.completed`

## Tenant Foundations

The catalog persistence layer now carries additive tenant fields:

- `brand_id` on catalog menu and store config tables
- a dedicated `catalog_app_configs` table keyed by `brand_id + location_id`

Persistence schema:

- [`packages/persistence/src/index.ts`](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/packages/persistence/src/index.ts)

Catalog defaults currently resolve to:

- `brandId = gazelle-default`
- `brandName = Gazelle Coffee`
- `locationId = flagship-01`
- `locationName = Gazelle Coffee Flagship`
- `marketLabel = Ann Arbor, MI`

## Mobile Consumption

Mobile config helpers:

- [`apps/mobile/src/menu/catalog.ts`](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/apps/mobile/src/menu/catalog.ts)
- [`apps/mobile/src/api/client.ts`](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/apps/mobile/src/api/client.ts)
- [`apps/operator-web/src/api.ts`](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/apps/operator-web/src/api.ts)

Behavior:

- customer menu/store calls still use the current API base
- customer mobile now prefers gateway `GET /v1/app-config` and falls back to the catalog service only if needed
- operator web uses the same gateway `GET /v1/app-config` route for runtime brand and store-capability visibility
- if app-config cannot be loaded, the app falls back to the default brand config so customer flows stay usable
- Apple Pay labels now use runtime brand config when available
- loyalty visibility, live order tracking, menu source, and staff dashboard availability now resolve from `storeCapabilities`

Relevant env vars:

- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_CATALOG_SERVICE_BASE_URL`
- `EXPO_PUBLIC_CATALOG_API_BASE_URL`
- `EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID`
- `EXPO_PUBLIC_BRAND_NAME`
- `VITE_API_BASE_URL`
- `ORDER_FULFILLMENT_MODE`

`ORDER_FULFILLMENT_MODE` currently supports:

- `staff`
- `time_based`

`ORDER_FULFILLMENT_MODE` is now only used to seed the default store capability profile for fresh environments. Once a store capability config is persisted, `app-config.storeCapabilities.operations.fulfillmentMode` becomes the authoritative runtime source for both the mobile app and the client dashboard. The schedule published in `app-config.fulfillment.timeBasedScheduleMinutes` still remains the shared default schedule for V1.

## Operational Notes

The flagship brand still defaults from static catalog tenant values. The new runtime config path makes those defaults replaceable without forcing customer or operator clients to hardcode them.

If the deployment wants a different brand or location, the catalog defaults should be changed in:

- [`services/catalog/src/tenant.ts`](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/services/catalog/src/tenant.ts)

## Verification

```bash
pnpm --filter @gazelle/contracts-catalog test
pnpm --filter @gazelle/catalog test
pnpm --filter @gazelle/sdk-mobile test
pnpm --filter @gazelle/mobile test
```
