# Project State

Audit basis: implementation only. This document was written from application code, service code, config, migrations, workflows, and infrastructure files in the monorepo. It does not rely on product or architecture docs as source of truth.

## 1. What We Are Building

Nomly is a quiet, infrastructural company building the digital surface area that small, independent operators need to compete with the chains. LatteLink is the first product — purpose-built for coffee shops — with more verticals to follow.

## 2. Monorepo Structure

### Apps

| Path | Purpose | Tech stack |
| --- | --- | --- |
| `apps/mobile` | Customer-facing mobile ordering app for iOS/Expo builds. | Expo, Expo Router, React Native, TypeScript, TanStack Query, Stripe React Native SDK, Apple Authentication, Zod |
| `apps/client-dashboard` | Store operator dashboard for orders, menu, cards, staff, and store settings. | Vite, TypeScript, vanilla SPA shell, Zod |
| `apps/admin-console` | Internal Nomly control plane for onboarding, readiness, owner provisioning, and payments setup. | Next.js App Router, React, TypeScript, server actions |
| `apps/lattelink-web` | Public marketing site and lead-capture surface. | Next.js App Router, React, TypeScript, Resend/webhook integrations |

### Shared Packages

| Path | Purpose | Tech stack |
| --- | --- | --- |
| `packages/config-eslint` | Shared ESLint configuration. | JavaScript config package |
| `packages/config-typescript` | Shared TS config presets. | TS/JSON config package |
| `packages/design-tokens` | Shared design token definitions. | TypeScript |
| `packages/persistence` | Shared Postgres/Kysely schema, migrations, repository types, and migration runner. | TypeScript, Kysely, `pg` |
| `packages/sdk-mobile` | Typed mobile SDK against the gateway contracts. | TypeScript, Zod |
| `packages/contracts/core` | Shared session and core API schemas. | TypeScript, Zod |
| `packages/contracts/auth` | Customer, operator, and internal-admin auth contracts. | TypeScript, Zod |
| `packages/contracts/catalog` | Catalog, app config, store config, cards, and internal-location contracts. | TypeScript, Zod |
| `packages/contracts/orders` | Quote, order, payment, and refund contracts. | TypeScript, Zod |
| `packages/contracts/loyalty` | Loyalty balance and ledger contracts. | TypeScript, Zod |
| `packages/contracts/notifications` | Push-token and notification dispatch contracts. | TypeScript, Zod |

### Backend Services

| Path | Purpose | Tech stack |
| --- | --- | --- |
| `services/gateway` | Public API gateway and auth/capability enforcement layer in front of downstream services. | Fastify, TypeScript, Zod, Fastify rate-limit, CORS |
| `services/identity` | Customer auth, operator auth, internal admin auth, profile management, sessions, and owner provisioning. | Fastify, TypeScript, Zod, SimpleWebAuthn, shared persistence |
| `services/catalog` | Menu, app config, store config, home/news cards, internal location bootstrap, and payment profile storage. | Fastify, TypeScript, Zod, shared persistence |
| `services/orders` | Quotes, orders, payment state, cancelation, and status progression. | Fastify, TypeScript, Zod, shared persistence |
| `services/payments` | Clover charging/refunds/OAuth/webhooks plus Stripe mobile checkout and Stripe Connect onboarding/dashboard links. | Fastify, TypeScript, Zod, Stripe SDK, shared persistence |
| `services/loyalty` | Loyalty balance and ledger logic. | Fastify, TypeScript, Zod, shared persistence |
| `services/notifications` | Push-token registration, order-state enqueueing, and outbox processing. | Fastify, TypeScript, Zod, shared persistence |

### Workers

| Path | Purpose | Tech stack |
| --- | --- | --- |
| `services/workers/menu-sync` | Periodic menu-import worker for an external menu source, now persisting into catalog through an internal route. | TypeScript, Zod |
| `services/workers/notifications-dispatch` | Periodic worker that triggers notifications outbox processing. | TypeScript, Zod |

## 3. Surfaces

### 3.1 Landing Page

What it is and who uses it:
- `apps/lattelink-web` is the public-facing marketing site for prospects and operators evaluating the product.

What is wired end-to-end:
- `/` renders `Nav`, `Hero`, `ProductOverview`, `HowItWorks`, `WhyItMatters`, `Nomly`, `Contact`, and `Footer`.
- `/privacy-policy` and `/terms` are full pages.
- `POST /api/pilot-intro` validates the lead form and can deliver submissions through either a webhook URL or Resend email.
- `scripts/validate-production-env.mjs` checks required production envs for the lead-delivery path.

Code that exists but is not wired into the live page:
- `src/components/About.tsx`
- `src/components/Features.tsx`
- `src/components/Pricing.tsx`
- `src/components/Analytics.tsx`
- `src/components/LeadCapture.tsx`
- `src/components/StructuredData.tsx`

Known issues or gaps visible from code:
- No authenticated operator or customer behavior exists here.
- No media upload/storage path exists here or elsewhere in the monorepo.
- Analytics-related component code exists, but the current home page mounts only the active imported sections.

### 3.2 Mobile App (`apps/mobile`)

What it is and who uses it:
- The customer-facing ordering app.
- Root providers in `app/_layout.tsx` set up React Query, bottom sheets, auth session, cart state, and checkout flow state.

What is wired end-to-end:

Navigation and bootstrap:
- `app/index.tsx`
  - Redirects authenticated users with incomplete profiles to `/profile-setup`.
  - Routes everyone else into the tab app.
- `app/(tabs)/_layout.tsx`
  - Four tabs: `home`, `menu`, `orders`, `account`.

Authentication and profile:
- `app/auth.tsx`
  - Apple Sign In flow is wired through the identity service.
  - Dev Sign In is wired in development builds.
  - Handles `returnTo` routing and profile-setup handoff.
  - Detects Expo Go and blocks unsupported Apple Sign In there with explicit copy.
- `app/profile-setup.tsx`
  - Collects name, phone, and birthday.
  - Name is required for completion.
  - Supports `Skip for now`, which defers completion rather than hard-blocking the account.
- `app/account/alerts.tsx`
  - Despite the route name, this is the profile editor screen.
  - Reads the current customer profile and saves name, phone, and birthday.
- `app/account/session.tsx`
  - Shows session metadata and auth recovery state.
- `app/account/settings.tsx`
  - Privacy and terms links.
  - Sign out.
  - Account deletion flow.

Home and discovery:
- `app/(tabs)/home.tsx`
  - Loads app config, store config, and home/news cards.
  - Shows store status, next-open label when closed, and configured home cards.
  - Supports pull-to-refresh.

Menu and cart:
- `app/(tabs)/menu.tsx`
  - Loads menu, app config, and store config.
  - Builds a `Featured` section plus category sections.
  - Handles image-loading reveal state, loading skeletons, and pull-to-refresh.
- `app/menu-customize.tsx`
  - Full customization flow with quantity control, option validation, notes, and pricing.
  - Supports single- and multi-select customization groups.
- `app/cart.tsx`
  - Full cart editor with item edit/removal, clear-cart affordances, pricing summary, and store-open gating before checkout.

Checkout:
- `app/checkout.tsx`
  - Uses store/app config to determine payment availability.
  - Supports Stripe PaymentSheet checkout with Apple Pay and cards when enabled.
  - Creates quote, order, and Stripe mobile session through the API and finalizes Stripe payment.
  - Cancels a prepared unpaid order on certain failure paths.
- `app/checkout-success.tsx`
  - Shows pickup code, order items, total, timestamp, and earned points.
- `app/checkout-failure.tsx`
  - Shows failed stage (`quote`, `create`, or `pay`), retry copy, and optional cancel-open-order behavior.

Orders and refunds:
- `app/(tabs)/orders.tsx`
  - Loads customer order history.
  - Highlights the active order with progress visualization.
  - Uses gateway order streaming with polling-backed fallback support in the client.
  - Supports canceling eligible orders.
- `app/orders/[orderId].tsx`
  - Order detail screen with timeline, item breakdown, pickup code, totals, and refund info.
- `app/refunds/[orderId].tsx`
  - Refund/cancel detail screen.
- `app/account/rewards.tsx`
  - Loyalty balance and ledger activity.

Account tab:
- `app/(tabs)/account.tsx`
  - Signed-out state routes into auth.
  - Signed-in state shows greeting, loyalty summary, and links to rewards, profile, session, and settings.

Code that exists but is incomplete, stubbed, or fallback-heavy:
- `apps/mobile/src/api/client.ts`
  - No longer falls back to localhost when `EXPO_PUBLIC_API_BASE_URL` is missing; release builds now require an explicit backend target and surface `Unable to reach backend.` on fetch failure.
  - Order streaming still carries a TODO to replace the current polling-backed authenticated SSE approach with a more native path when Expo runtime support is reliable everywhere.
- `apps/mobile/src/menu/catalog.ts`
  - Still carries fallback app config, store config, menu, and card data in code.

Known issues or gaps visible from code:
- Passkey auth exists in backend contracts and services, but the mobile app still does not expose a passkey registration or sign-in UI.
- `/account/alerts` is a profile editor, not an alerts/preferences surface.
- The app still depends on runtime config for payment readiness; misconfigured Stripe/Clover states surface as unavailability.
- Native beta defaults are now generic (`LatteLink Beta`, `com.lattelink.mobile.beta`, `merchant.com.lattelink.mobile.beta`), but production tenant-specific mobile build configuration is still env-driven rather than dynamically provisioned.

### 3.3 Backend Services

What they are and who uses them:
- `services/gateway` is the intended public API surface.
- Downstream services are implementation services behind the gateway or internal tokens.
- Workers are background jobs rather than user-facing surfaces.

#### Gateway (`services/gateway`)

Routes:
- `GET /health`
- `GET /ready`
- `GET /v1/meta/contracts`
- `GET /v1/payments/clover/oauth/status`
- `GET /v1/payments/clover/card-entry-config`
- `POST /v1/payments/stripe/mobile-session`
- `POST /v1/payments/stripe/mobile-session/finalize`
- `POST /v1/internal/locations/:locationId/stripe/onboarding-link`
- `POST /v1/internal/locations/:locationId/stripe/dashboard-link`
- `GET /v1/payments/clover/webhooks/verification-code`
- `GET /v1/payments/clover/oauth/connect`
- `GET /v1/payments/clover/oauth/callback`
- `POST /v1/payments/clover/oauth/refresh`
- `POST /v1/payments/webhooks/clover`
- `POST /v1/payments/webhooks/stripe`
- `POST /v1/auth/apple/exchange`
- `POST /v1/auth/passkey/register/challenge`
- `POST /v1/auth/passkey/register/verify`
- `POST /v1/auth/passkey/auth/challenge`
- `POST /v1/auth/passkey/auth/verify`
- `POST /v1/auth/dev-access`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `DELETE /v1/auth/account`
- `GET /v1/auth/me`
- `POST /v1/auth/profile`
- `POST /v1/operator/auth/sign-in`
- `GET /v1/operator/auth/providers`
- `GET /v1/operator/auth/google/start`
- `POST /v1/operator/auth/google/exchange`
- `POST /v1/operator/auth/dev-access`
- `POST /v1/operator/auth/refresh`
- `POST /v1/operator/auth/logout`
- `GET /v1/operator/auth/me`
- `POST /v1/internal-admin/auth/sign-in`
- `POST /v1/internal-admin/auth/refresh`
- `POST /v1/internal-admin/auth/logout`
- `GET /v1/internal-admin/auth/me`
- `GET /v1/menu`
- `GET /v1/app-config`
- `GET /v1/store/config`
- `GET /v1/store/cards`
- `POST /v1/orders/quote`
- `POST /v1/orders`
- `POST /v1/orders/:orderId/pay`
- `GET /v1/orders`
- `GET /v1/orders/:orderId`
- `GET /v1/orders/:orderId/stream`
- `POST /v1/orders/:orderId/cancel`
- `GET /v1/admin/orders`
- `GET /v1/admin/orders/:orderId`
- `POST /v1/admin/orders/:orderId/status`
- `GET /v1/admin/menu`
- `GET /v1/admin/cards`
- `GET /v1/cards`
- `PUT /v1/admin/cards`
- `POST /v1/admin/cards`
- `PUT /v1/admin/cards/:cardId`
- `PATCH /v1/admin/cards/:cardId/visibility`
- `DELETE /v1/admin/cards/:cardId`
- `PUT /v1/admin/menu/:itemId`
- `POST /v1/admin/menu`
- `PATCH /v1/admin/menu/:itemId/visibility`
- `DELETE /v1/admin/menu/:itemId`
- `GET /v1/admin/store/config`
- `PUT /v1/admin/store/config`
- `GET /v1/admin/staff`
- `POST /v1/admin/staff`
- `PATCH /v1/admin/staff/:operatorUserId`
- `POST /v1/internal/locations/bootstrap`
- `GET /v1/internal/locations`
- `GET /v1/internal/locations/:locationId`
- `GET /v1/internal/locations/:locationId/payment-profile`
- `PUT /v1/internal/locations/:locationId/payment-profile`
- `GET /v1/internal/locations/:locationId/owner`
- `POST /v1/internal/locations/:locationId/owner/provision`
- `GET /v1/loyalty/balance`
- `GET /v1/loyalty/ledger`
- `PUT /v1/devices/push-token`

Known issues or gaps:
- `GET /v1/orders/:orderId/stream` is polling-backed SSE, not event-bus-backed streaming.

#### Identity (`services/identity`)

Routes:
- `GET /health`
- `GET /ready`
- `POST /v1/auth/apple/exchange`
- `POST /v1/auth/passkey/register/challenge`
- `POST /v1/auth/passkey/register/verify`
- `POST /v1/auth/passkey/auth/challenge`
- `POST /v1/auth/passkey/auth/verify`
- `POST /v1/auth/dev-access`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `DELETE /v1/auth/account`
- `GET /v1/auth/me`
- `POST /v1/auth/profile`
- `POST /v1/operator/auth/sign-in`
- `GET /v1/operator/auth/providers`
- `GET /v1/operator/auth/google/start`
- `POST /v1/operator/auth/google/exchange`
- `POST /v1/operator/auth/dev-access`
- `POST /v1/operator/auth/refresh`
- `POST /v1/operator/auth/logout`
- `GET /v1/operator/auth/me`
- `POST /v1/internal-admin/auth/sign-in`
- `POST /v1/internal-admin/auth/refresh`
- `POST /v1/internal-admin/auth/logout`
- `GET /v1/internal-admin/auth/me`
- `GET /v1/operator/users`
- `POST /v1/operator/users`
- `PATCH /v1/operator/users/:operatorUserId`
- `POST /v1/identity/internal/locations/:locationId/owner/provision`
- `GET /v1/identity/internal/locations/:locationId/owner`
- `POST /v1/auth/internal/ping`

Known issues or gaps:
- Refresh rotation currently behaves as idle-timeout rotation; the code does not enforce a separate absolute-session lifetime policy.
- Customer passkeys are fully supported server-side, but mobile still lacks a passkey UI/client integration.

#### Catalog (`services/catalog`)

Routes:
- `GET /health`
- `GET /ready`
- `GET /v1/app-config`
- `GET /v1/menu`
- `GET /v1/cards`
- `GET /v1/store/cards`
- `GET /v1/store/config`
- `GET /v1/catalog/admin/menu`
- `GET /v1/catalog/admin/cards`
- `PUT /v1/catalog/admin/cards`
- `POST /v1/catalog/admin/cards`
- `PUT /v1/catalog/admin/cards/:cardId`
- `PATCH /v1/catalog/admin/cards/:cardId/visibility`
- `DELETE /v1/catalog/admin/cards/:cardId`
- `PUT /v1/catalog/admin/menu/:itemId`
- `POST /v1/catalog/admin/menu`
- `PATCH /v1/catalog/admin/menu/:itemId/visibility`
- `DELETE /v1/catalog/admin/menu/:itemId`
- `GET /v1/catalog/admin/store/config`
- `PUT /v1/catalog/admin/store/config`
- `POST /v1/catalog/internal/locations/bootstrap`
- `GET /v1/catalog/internal/locations`
- `GET /v1/catalog/internal/locations/:locationId`
- `PUT /v1/catalog/internal/locations/:locationId/menu`
- `GET /v1/catalog/internal/locations/:locationId/payment-profile`
- `PUT /v1/catalog/internal/locations/:locationId/payment-profile`
- `POST /v1/catalog/internal/ping`

Known issues or gaps:
- Runtime defaults are still opinionated around one seeded tenant.
- Several default payloads are still sample merchant content.

#### Orders (`services/orders`)

Routes:
- `GET /health`
- `GET /ready`
- `POST /v1/orders/internal/payments/reconcile`
- `GET /v1/orders/internal/:orderId/payment-context`
- `POST /v1/orders/quote`
- `POST /v1/orders`
- `POST /v1/orders/:orderId/pay`
- `GET /v1/orders`
- `GET /v1/orders/:orderId`
- `POST /v1/orders/:orderId/cancel`
- `POST /v1/orders/:orderId/status`
- `POST /v1/orders/internal/ping`

Known issues or gaps:
- Full behavior depends on catalog, payments, loyalty, and notifications being correctly configured.

#### Payments (`services/payments`)

Routes:
- `GET /health`
- `GET /ready`
- `GET /v1/payments/clover/oauth/status`
- `GET /v1/payments/clover/card-entry-config`
- `POST /v1/payments/stripe/mobile-session`
- `POST /v1/payments/stripe/mobile-session/finalize`
- `POST /v1/payments/stripe/connect/onboarding-link`
- `POST /v1/payments/stripe/connect/dashboard-link`
- `GET /v1/payments/clover/webhooks/verification-code`
- `GET /v1/payments/clover/oauth/connect`
- `GET /v1/payments/clover/oauth/callback`
- `POST /v1/payments/clover/oauth/refresh`
- `POST /v1/payments/orders/submit`
- `POST /v1/payments/charges`
- `POST /v1/payments/refunds`
- `POST /v1/payments/webhooks/stripe`
- `POST /v1/payments/webhooks/clover`
- `POST /v1/payments/internal/ping`

Known issues or gaps:
- A meaningful amount of behavior is still designed around simulated mode.
- The Stripe SDK client is still instantiated with a placeholder secret when no real secret is configured, even though guarded routes reject missing configuration before use.

#### Loyalty (`services/loyalty`)

Routes:
- `GET /health`
- `GET /ready`
- `GET /v1/loyalty/balance`
- `GET /v1/loyalty/ledger`
- `POST /v1/loyalty/internal/ledger/apply`
- `POST /v1/loyalty/internal/ping`

Known issues or gaps:
- The rewards model is fixed points logic, not a configurable merchant-defined loyalty program.

#### Notifications (`services/notifications`)

Routes:
- `GET /health`
- `GET /ready`
- `PUT /v1/devices/push-token`
- `POST /v1/notifications/internal/order-state`
- `POST /v1/notifications/internal/outbox/process`
- `POST /v1/notifications/internal/ping`

Known issues or gaps:
- The service now supports an Expo push provider mode through `NOTIFICATIONS_PROVIDER_MODE=expo`, `EXPO_PUSH_API_URL`, and optional `EXPO_ACCESS_TOKEN`.
- The fallback provider is still simulated mode, so environments without Expo provider config do not send real pushes.
- No push receipt polling, delivery analytics, or deeper provider observability is implemented.

#### Workers

`services/workers/menu-sync`:
- Fetches `WEBAPP_MENU_SOURCE_URL` when that env is configured.
- Parses the external payload into the shared menu schema.
- Retries with exponential backoff and dead-letters failures to JSONL.
- Persists successful payloads into catalog via `PUT /v1/catalog/internal/locations/:locationId/menu` using `x-gateway-token`.
- When `WEBAPP_MENU_SOURCE_URL` is blank, the worker stays deployed but idles in a disabled state instead of crash-looping.
- Gap: the parser is still tailored to one external payload shape and not yet a general ingestion framework.

`services/workers/notifications-dispatch`:
- Periodically calls `POST /v1/notifications/internal/outbox/process`.
- Depends on the notifications service for actual provider behavior.

### 3.4 Operator Dashboard

What it is and who uses it:
- `apps/client-dashboard` is the store-operator surface for owners, managers, and staff.

What is wired end-to-end:
- Auth screen:
  - email/password sign-in
  - Google SSO provider discovery and callback exchange
  - dev API base URL override in local/dev mode
- `Overview`
  - KPI cards
  - recent business summary
  - 7-day orders chart
- `Orders`
  - active/all/completed filters
  - order detail view
  - status progression
  - staff cancel action
  - disabled-state messaging when fulfillment mode does not allow direct status control
- `Menu`
  - category and item list
  - item edit
  - item delete
  - visibility toggle
  - customization group editing
  - multi-step create-item wizard
- `News cards`
  - list, create, edit, visibility toggle, delete
- `Team`
  - list operator accounts
  - create team member
  - update team member
  - role and active-state management
- `Store`
  - store name and location name
  - hours
  - pickup instructions
  - tax rate and fulfillment-related config

Code that exists but is incomplete, stubbed, or not wired:
- Apple operator SSO button exists in `src/views/auth.ts` but is hard-disabled and labeled `Coming soon`.

Known issues or gaps visible from code:
- This app is tightly dependent on backend capabilities and capability flags.
- It is a single SPA shell rather than a route-split application.

### 3.5 Admin Console

What it is and who uses it:
- `apps/admin-console` is the internal Nomly/LatteLink control plane.
- It exists, is wired, and now has a dedicated Vercel deployment workflow in `.github/workflows/admin-console-vercel.yml`.

What is wired end-to-end:
- `/`
  - redirects to `/dashboard` if a session exists, otherwise `/sign-in`
- `/sign-in`
  - internal admin email/password sign-in via server action and signed session cookie
- `/(console)/dashboard`
  - location summary cards
  - readiness counts
  - recent activity feed
- `/(console)/clients`
  - client/location table and search
- `/(console)/clients/new`
  - multi-step onboarding for client identity, location identity, baseline capabilities, and owner access
  - bootstraps the location and provisions the owner
- `/(console)/launch-readiness`
  - readiness board across clients
- `/(console)/settings`
  - environment readiness checks
  - session secret presence and strength checks
  - API base URL validation and HTTPS safety checks
  - client dashboard URL validation
  - explicit Vercel production-safety messaging
- `/(console)/clients/[locationId]`
  - per-client overview, owner summary, readiness, and payment summary
- `/(console)/clients/[locationId]/capabilities`
  - capability and store config editing
- `/(console)/clients/[locationId]/owner`
  - owner summary and reprovision flow
- `/(console)/clients/[locationId]/payments`
  - Stripe onboarding/dashboard link creation and payment profile display

Code that exists but is incomplete, stubbed, or not wired:
- Owner-page copy still refers to future reset flows that are not implemented.

Known issues or gaps visible from code:
- This app has no mock mode; it depends on `INTERNAL_ADMIN_API_BASE_URL` and `ADMIN_CONSOLE_SESSION_SECRET`.
- Because it is deployed on Vercel, production config drift is operationally important: non-HTTPS API origins and weak secrets are now explicitly treated as unsafe.

## 4. Infrastructure & Configuration

### Deployment

What is in code:
- `infra/free/docker-compose.yml` defines a deployable stack with:
  - `caddy`
  - `gateway`
  - `identity`
  - `orders`
  - `catalog`
  - `payments`
  - `loyalty`
  - `notifications`
  - `worker-menu-sync`
  - `worker-notifications-dispatch`
  - `postgres`
  - `valkey`
- `infra/free/Caddyfile` terminates traffic and proxies to the gateway.
- `infra/docker/node-service.Dockerfile` is the shared service image build path.
- `infra/free/bin/bootstrap-ubuntu-host.sh` prepares an Ubuntu host for the single-host deployment path.
- The admin console is separately deployed on Vercel via `.github/workflows/admin-console-vercel.yml`.
- The client dashboard is separately deployed on Vercel via `.github/workflows/client-dashboard-vercel.yml`.
- The marketing site is separately deployed on Vercel via `.github/workflows/lattelink-vercel.yml`.

What is not in code:
- No DigitalOcean-specific deployment implementation was found.
- Terraform in this repo targets AWS modules, not DigitalOcean.

### Environment Variables

Where they live:
- `infra/free/.env.example`
- `apps/mobile/.env.example`
- `apps/client-dashboard/.env.example`
- `apps/admin-console/.env.example`
- `apps/lattelink-web/.env.example`

Major env families visible in code:
- Core routing and service-to-service auth:
  - `GATEWAY_INTERNAL_API_TOKEN`
  - `*_SERVICE_BASE_URL`
  - `*_INTERNAL_API_TOKEN`
- Persistence:
  - `DATABASE_URL`
  - `ALLOW_IN_MEMORY_PERSISTENCE`
- Identity:
  - `JWT_SECRET`
  - `APPLE_*`
  - `GOOGLE_OAUTH_*`
  - `PASSKEY_*`
- Payments:
  - `PAYMENTS_PROVIDER_MODE`
  - `CLOVER_*`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_PUBLISHABLE_KEY`
  - `STRIPE_CONNECT_WEBHOOK_SECRET`
- Notifications:
  - `NOTIFICATIONS_PROVIDER_MODE`
  - `EXPO_PUSH_API_URL`
  - `EXPO_ACCESS_TOKEN`
- Menu sync:
  - `WEBAPP_MENU_SOURCE_URL`
  - `MENU_SYNC_LOCATION_ID`
  - `MENU_SYNC_INTERVAL_MS`
  - `MENU_SYNC_MAX_RETRIES`
  - `MENU_SYNC_RETRY_DELAY_MS`
- Mobile:
  - `EXPO_PUBLIC_API_BASE_URL`
  - `EXPO_PUBLIC_CATALOG_API_BASE_URL`
  - `EXPO_PUBLIC_PRIVACY_POLICY_URL`
  - `EXPO_PUBLIC_TERMS_URL`
- Admin console:
  - `ADMIN_CONSOLE_SESSION_SECRET`
  - `INTERNAL_ADMIN_API_BASE_URL`
  - `ADMIN_CONSOLE_CLIENT_DASHBOARD_URL`

### CI/CD

GitHub Actions in `.github/workflows`:
- `ci.yml`
- `publish-free-images.yml`
- `deploy-free.yml`
- `client-dashboard-vercel.yml`
- `admin-console-vercel.yml`
- `lattelink-vercel.yml`
- `codeql.yml`
- `dependency-review.yml`
- `secret-scan.yml`

### Media Storage

Code state:
- No Cloudflare R2 implementation was found.
- No S3-compatible media upload pipeline was found.
- Menu and card payloads reference image URLs, but no storage service or upload surface exists in this monorepo.

### Database

Primary database:
- Postgres through `packages/persistence`.

Major schema areas visible in code:
- Catalog:
  - `catalog_menu_categories`
  - `catalog_menu_items`
  - `catalog_home_news_cards`
  - `catalog_store_configs`
  - `catalog_app_configs`
  - `catalog_payment_profiles`
- Orders:
  - `orders_quotes`
  - `orders`
  - idempotency tables
- Payments:
  - charge rows
  - refund rows
  - webhook event tables
  - Clover OAuth connections
- Identity:
  - customer users
  - customer sessions
  - passkey challenges
  - passkey credentials
  - operator users
  - operator sessions
  - internal admin users
  - internal admin sessions
- Loyalty:
  - balances
  - ledger entries
  - idempotency keys
- Notifications:
  - push tokens
  - order-state dedupe
  - notifications outbox

Migration state visible in code:
- Migrations live under `packages/persistence/src/migrations`.
- Notable current migrations include:
  - `0001_initial_schema.ts`
  - `0006_add_store_name_hours.ts`
  - `0007_identity_users.ts`
  - `0008_magic_links.ts`
  - `0010_payments_clover_oauth.ts`
  - `0011_operator_access.ts`
  - `0015_home_news_cards.ts`
  - `0018_internal_admin_access.ts`
  - `0020_stripe_phase1_foundations.ts`
  - `0023_normalize_catalog_default_brand.ts`
  - `0024_remove_magic_link_auth.ts`

### Payment Integration

Implemented in code:
- Clover:
  - OAuth
  - credential refresh
  - card-entry config
  - charges
  - refunds
  - webhooks
  - order submission
- Stripe:
  - mobile PaymentIntent session creation
  - finalization
  - Connect onboarding links
  - Connect dashboard links
  - webhook verification and reconciliation
- Apple Pay:
  - mobile app integrates Stripe PaymentSheet with Apple Pay merchant support
  - iOS native project contains Apple Pay entitlements

Notable caveats:
- Payment readiness is tenant-config-driven; many routes degrade until Clover and/or Stripe are fully configured.

## 5. Current Tenant Configuration

What can be confirmed from code:
- The canonical runtime default tenant is:
  - `brandId`: `rawaqcoffee`
  - `locationId`: `rawaqcoffee01`
  - `brandName`: `Rawaq Coffee`
  - `locationName`: `Rawaq Coffee Flagship`
  - `marketLabel`: `Ann Arbor, MI`

How tenant data is seeded:
- Catalog repository seeds a default tenant with:
  - app config
  - menu
  - store config
  - home/news cards
  - payment profile summary
- Internal admins can create additional tenants through:
  - `POST /v1/internal/locations/bootstrap`
  - `POST /v1/internal/locations/:locationId/owner/provision`

Hardcoded tenant references in runtime code:
- `services/catalog/src/tenant.ts`
  - `rawaqcoffee`
  - `rawaqcoffee01`
- `apps/mobile/src/menu/catalog.ts`
  - fallback values now align to `rawaqcoffee` / `rawaqcoffee01`
- `services/workers/menu-sync/src/worker.ts`
  - default `MENU_SYNC_LOCATION_ID` is `rawaqcoffee01`
- `packages/persistence`
  - current brand defaults are normalized to `rawaqcoffee` through code and migration `0021_normalize_catalog_default_brand.ts`

Historical references still present in repo but not current runtime defaults:
- Older migrations still set earlier defaults like `gazelle-default`.
- Many tests still reference `flagship-01` and `gazelle-default`.

Active-tenant conclusion:
- From runtime code alone, the only directly confirmed seeded tenant is `rawaqcoffee` / `rawaqcoffee01`.
- The admin console can provision additional tenants, but no committed data proves any additional active tenant.

## 6. What Is Deferred / Not Yet Built

Items explicitly visible from code:
- Mobile customer auth still does not expose passkey registration or sign-in.
- Operator Apple SSO UI is present but disabled with `Coming soon`.
- Mobile order streaming still carries a TODO to replace the current fallback-heavy authenticated SSE path.
- No Cloudflare R2 or other media upload/storage implementation exists.
- Landing-page components `About`, `Features`, `Pricing`, `Analytics`, `LeadCapture`, and `StructuredData` exist but are not mounted on the live home page.
- `packages/persistence/src/index.ts` still contains deprecated table-bootstrap code alongside migrations.
- Admin owner-page copy references future reset flows that are not implemented.
- Notifications provider mode can be real Expo or simulated, but there is no receipt polling, provider analytics, or richer delivery observability.
- Menu sync now persists into catalog and idles cleanly when unconfigured, but it is still a single-source parser rather than a generalized import system.
