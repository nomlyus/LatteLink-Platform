# Technical Debt Register

Last updated: 2026-04-27  
Basis: code audit (not documentation)

Format: ID | Severity | Location | Description | Resolution path

---

## Critical (blocks real merchant pilots)

**TD-01** — Time-based fulfillment is the production default  
Location: `services/catalog/src/tenant.ts`, `resolveDefaultAppConfigPayload`  
Description: `fulfillmentMode` defaults to `time_based`. Orders auto-progress through PAID → IN_PREP → READY → COMPLETED on a timer, regardless of staff action. This is never appropriate for a real merchant.  
Resolution: Change default to `staff`. Enforce at onboarding. See ROADMAP Gate 1.

**TD-02** — Loyalty balances have no merchant scope  
Location: `loyalty_balances` table (migration 0001), `services/loyalty/src/routes.ts`  
Description: `loyalty_balances` PK is `user_id` with no `location_id`. Loyalty is shared across all merchants on the platform. A second merchant's customers can redeem points earned elsewhere.  
Resolution: Migration to add `location_id` and change PK to `(user_id, location_id)`. See ROADMAP Gate 1.

**TD-03** — Media upload pipeline is implemented but not yet proven in deployment  
Location: `services/catalog/src/media-storage.ts`, `services/catalog/src/routes.ts`  
Description: The catalog service, gateway, and client dashboard already implement the R2 presigned upload flow, but it still needs staging verification with real bucket credentials, public asset URLs, and end-to-end image persistence.  
Resolution: Validate the existing R2 flow in staging, document required env/bucket setup, and harden any deployment-specific gaps. See ROADMAP Gate 1.

---

## High (breaks trust or creates risk at scale)

**TD-04** — Order SSE stream still polls even when event-bus subscription succeeds  
Location: `services/gateway/src/routes.ts` (stream route)  
Description: `GET /v1/orders/:orderId/stream` already subscribes to `EventBusSubscriber.subscribeToOrderStatus`, but it also keeps a polling loop active as a safety net. That means the event bus is not yet the sole steady-state transport.  
Resolution: Keep polling only as fallback when subscription setup fails, not in parallel with a healthy event-bus stream. See ROADMAP Gate 1.

**TD-05** — No structured error logging or alerting  
Location: All services  
Description: Services log to stdout but there is no log aggregation, no error tracking (Sentry), and no uptime monitoring. Silent failures in the payment path would go unnoticed.  
Resolution: Add Sentry, structure logs as JSON, set up basic alerting. See ROADMAP Gate 1.

**TD-06** — Single-host deployment with no failover  
Location: `infra/free/docker-compose.yml`  
Description: All services run on one host. A host reboot means downtime during a merchant's service window. Acceptable for a controlled pilot but must be disclosed upfront.  
Resolution: Separate development and production immediately for pilot safety, then move toward managed infrastructure when operating reality justifies it. See ROADMAP Gate 1 and Gate 3.

**TD-07** — Operator email globally unique across all tenants  
Location: `operator_users` table (migration 0011), unique index on `email`  
Description: An operator who works at two different merchant locations cannot have accounts at both because their email is globally unique. The `operator_location_access` table was added (migration 0028) to model multi-location access, but the email constraint was not relaxed.  
Resolution: Change unique index to `(email, brand_id)` or remove the email constraint entirely in favor of unique `(email, location_id)`.

**TD-08** — Payment webhook reconciliation has no stale-order recovery  
Location: `services/payments/src/routes.ts`, `services/orders/src/routes.ts`  
Description: If a Stripe webhook is missed or delayed, an order can stay in `PENDING_PAYMENT` indefinitely. There is no background job that reconciles stale orders against Stripe's PaymentIntent status.  
Resolution: Add a reconciliation worker that checks Stripe for any order stuck in `PENDING_PAYMENT` for more than N minutes.

**TD-09** — No absolute session TTL for customer or operator tokens  
Location: `services/identity/src/routes.ts`  
Description: Session refresh uses idle-timeout rotation (access token refreshed if within window), but there is no enforcement of an absolute session lifetime. A session from Day 1 can be refreshed indefinitely.  
Resolution: Track `created_at` on sessions. Reject refresh if `created_at + ABSOLUTE_TTL` has passed. Make TTL configurable.

**TD-10** — No proper separation between development and production  
Location: deployment topology / runtime environments  
Description: Development, testing, and the deployed pilot runtime are not cleanly separated. That makes it too easy to test directly against the live system, mix secrets/config, and ship changes without a safe pre-production path.  
Resolution: Create separate dev and production environments with isolated secrets, data, and deployment flow. Use the shared `dev` environment as the release-candidate lane before production. This is a Gate 1 requirement.

---

## Medium (creates friction or technical risk)

**TD-11** — Hardcoded `rawaqcoffee` defaults in catalog/tenant.ts  
Location: `services/catalog/src/tenant.ts`  
Description: `DEFAULT_BRAND_ID = "rawaqcoffee"`, `DEFAULT_LOCATION_ID = "rawaqcoffee01"` are hardcoded. Routes that lack a `locationId` query param fall back to these values.  
Resolution: Remove fallback defaults. All reads must specify `locationId`. Admin console must always bootstrap with explicit IDs.

**TD-12** — Mobile app is single-tenant per EAS build  
Location: `apps/mobile/` EAS configuration  
Description: Brand name, bundle ID, and location ID are baked into the build profile. A new merchant requires a new EAS build profile and separate App Store listing.  
Resolution: Accept this as the operational model (separate branded apps) with documented per-merchant build process, or invest in dynamic merchant routing later if operating reality demands it.

**TD-13** — Fallback menu/config data in mobile catalog.ts  
Location: `apps/mobile/src/menu/catalog.ts`  
Description: Fallback app config, store config, menu, and card data exists in client code. A misconfigured backend would silently show Rawaq Coffee content to a customer of a different merchant.  
Resolution: Remove fallbacks. Surface "Unable to reach backend" explicitly. The backend is required.

**TD-14** — No push notification receipt polling  
Location: `services/notifications/src/`, `services/workers/notifications-dispatch/`  
Description: Push notifications are sent to Expo's API but delivery receipts are never polled. Failed deliveries are invisible.  
Resolution: Add a Expo push receipt polling worker before campaigns become part of the Growth OS buildout in Gate 3.

**TD-15** — Loyalty is fixed 1pt = 1¢, not merchant-configurable  
Location: `services/loyalty/src/routes.ts`  
Description: The earn/redeem rate is hardcoded (1 point per 1 cent, 1 point = 1 cent redemption value). Merchants cannot set their own loyalty program parameters.  
Resolution: Create `loyalty_programs` table per merchant. See ROADMAP Gate 3.

**TD-16** — Passkey UI missing on mobile (server is ready)  
Location: `apps/mobile/app/auth.tsx`  
Description: Passkey (WebAuthn) registration and authentication is fully implemented in the identity service, but the mobile app has no UI to trigger it. Customers cannot register or use passkeys.  
Resolution: Add passkey register/auth flow to the mobile auth screen. See ROADMAP Gate 2.

**TD-17** — Admin console owner page has copy for reset flows not implemented  
Location: `apps/admin-console/src/`  
Description: Owner provisioning page references future "reset owner" functionality that is not implemented.  
Resolution: Remove or placeholder the copy until the feature is built.

---

## Low (cleanup / polish)

**TD-18** — `docs/architecture/architecture-overview.md` is stale and misleading  
Description: References `api.gazellecoffee.com` (old brand/domain), claims `/metrics` route exists (it doesn't), describes notifications as simulated (they now support Expo push).  
Resolution: Rewrite. See ROADMAP Gate 1.

**TD-19** — `CHANGELOG.md` is empty  
Description: "No release entries recorded yet." Either populate it or remove it.  
Resolution: Add entries on each significant release, or use git tags as the changelog source.

**TD-20** — `repo-files.md` appears to be a stale generated file list  
Description: `repo-files.md` at root is a complete file listing, not a useful document. It is likely stale.  
Resolution: Remove. Use `find` or `ls` when needed.

**TD-21** — `packages/persistence/src/index.ts` contains deprecated table-bootstrap code  
Description: Legacy in-memory table provisioning code exists alongside the migration runner. This is confusing and the legacy path should not be used in production.  
Resolution: Remove deprecated bootstrap code from the persistence package.

**TD-22** — `docs/implementation/final-25-percent-*.md` are ephemeral development artifacts  
Description: Implementation notes from a specific sprint. Not architecture documentation. Will become confusing over time.  
Resolution: Archive or remove.

**TD-23** — Duplicate migration numbering (`0015_home_news_cards` and `0015_identity_customer_birthday`)  
Location: `packages/persistence/src/migrations/`  
Description: Two migrations share the `0015` prefix. This works because they have different full names, but it creates confusion in ordering and future maintenance.  
Resolution: Renumber one of them (requires careful coordination with the migration runner to avoid re-running migrations on existing databases).
