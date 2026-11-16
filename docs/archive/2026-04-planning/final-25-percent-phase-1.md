# Final 25 Percent Phase 1

Last updated: `2026-03-20`

## Delivered

- canonical order lifecycle helpers with source-attributed timeline entries
- refund-aware staff cancellation path through the gateway admin surface
- hardened payment idempotency and retry coverage
- additive platform config and tenant defaults via `GET /v1/app-config`
- admin menu and store-config routes with gateway protection
- browser-based client dashboard under `apps/client-dashboard`

## Customer-Facing Impact

- customer mobile keeps existing menu, cart, checkout, and order flows
- mobile now prefers runtime app-config from the gateway and falls back safely
- order timelines now support optional transition source metadata

## Operator Impact

- staff can progress paid orders to `IN_PREP`, `READY`, and `COMPLETED`
- staff can cancel through the existing refund-aware backend path
- menu item name, price, and visibility can be edited without a mobile release
- store name, hours, and pickup instructions can be updated from the browser app

## Platform Impact

- catalog config now carries additive `brand_id` and `location_id` foundations
- app branding and feature visibility are no longer only hardcoded mobile values
- gateway/openapi/sdk artifacts now include the app-config contract

## Remaining Follow-Up

- move fulfillment mode and schedule into tenant-managed runtime configuration
- replace the current shared staff token model with real operator authentication and role scopes
- run the socket-bound orders payments e2e suite outside the current sandbox
