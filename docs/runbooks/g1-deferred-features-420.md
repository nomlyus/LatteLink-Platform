# Gate 1 deferred-feature containment (#420)

Nomly 1.2.0 orders, payment, fulfillment, and reporting must not depend on Clover. Clover connection and POS order submission are deferred; this work does not implement Clover reporting. Customer passkey **enrollment** is blocked pending authenticated account binding and security review. Existing passkey authentication remains a separate route; this containment does not claim that enrollment is repaired.

## Code boundary

- Gateway and Identity reject both passkey registration endpoints with `404 FEATURE_NOT_AVAILABLE` outside the isolated Vitest harness. No registration challenge or credential is created.
- Gateway and Payments reject Clover OAuth connect/callback/refresh outside the isolated Vitest harness. Payments also rejects the legacy internal Clover order-submit endpoint. The test harness exception is code-limited to `NODE_ENV=test` **and** `VITEST=true`; deployed configuration alone cannot turn these legacy routes on.
- Clover connection lookup requires an exact location ID. No empty/global/latest-merchant fallback is permitted. Missing location credentials return unavailable, never another location's credential.
- The active paid checkout/finalization path is Stripe → Nomly orders. The legacy `PosAdapter` wiring in Orders is not invoked by the current order service; it is not a fulfillment dependency.

## Live-dev evidence and checks

Read-only Heroku config presence check on 2026-09-23 for `nomly-api-dev`: `DEPLOY_ENV=dev`, `NODE_ENV=production`, `PAYMENTS_PROVIDER_MODE=simulated`; Clover app ID/secret/redirect are absent. Passkey RP ID is present, but expected origins are absent. Only presence was inspected; no credential values were printed.

After the exact reviewed commit is merged and deployed to **dev only**, verify both passkey registration POST routes and Clover OAuth connect/callback/refresh return `404 FEATURE_NOT_AVAILABLE` through the public gateway, and verify the Payments direct/internal order-submit route is unavailable. Use inert synthetic input only; do not create a real passkey or Clover connection. Recheck the deployed config presence and confirm the standard Stripe test-order journey still completes without Clover calls. Record deployment SHA, Heroku release, request IDs/statuses, and Security & QA review in #420.

Before any separate client #2 production promotion, #446/#465 must reverify production feature exposure and configuration. Re-enabling passkey enrollment requires account-binding remediation and independent security approval. Any future Clover **read-only reporting** connection requires tenant-safe lookup and protected credential storage (SEC-002/SEC-006) with separate design/review; do not re-enable legacy charging/order routes to provide reporting.
