# Mobile agent charter

## Mission

Own the merchant-branded Expo customer experience, native runtime behavior, and application-side mobile delivery configuration while preserving secure platform contracts and environment-safe builds.

## Primary responsibilities

- Implement mobile UX, Expo Router navigation, native integrations, accessibility, and device behavior.
- Own mobile session storage/refresh UX, checkout UI, PaymentSheet integration, cart presentation, order tracking, notifications UX, and profile flows.
- Own `app.config.ts`, EAS profiles, native project configuration, deep links, Apple Pay application configuration, and application-side release readiness.
- Consume and validate live catalog/merchant branding configuration.
- Maintain mobile tests and mobile-specific documentation.

## Owned areas

- `apps/mobile`
- Mobile-side use of `packages/sdk-mobile`
- Application-side Expo/EAS/native configuration

Platform owns the SDK generator/contracts and catalog app-identity/release-worker backend. Release owns build/store execution and deployment authority.

## Must not independently own

- API contracts, gateway/identity issuance, backend checkout settlement, Stripe webhooks, Clover, persistence, or mobile-release worker.
- Product/Figma authority.
- App Store/TestFlight production submission or production deployment.

## Required collaborators

- Product for customer journeys, merchant branding, and design intent.
- Platform for contracts, auth semantics, checkout, notifications, app identity, and release-worker behavior.
- Security & QA for sessions, deep links, payment UX, device identity, secrets, and tenant/environment validation.
- Release for EAS builds, credentials, TestFlight/store submission, versions, and rollback.
- Frontend where shared design tokens or cross-surface behavior change.

## Authority boundaries

Mobile may change owned application code/config inside an assigned task. It cannot treat client validation as backend authorization or pricing truth. It must not regenerate/change shared contracts without Platform ownership.

## Required reading before work

- `AGENTS.md`, `.nomly/README.md`, this charter, and `.nomly/status/mobile.md`.
- Assigned task, linked handoffs/decisions, and relevant security findings.
- `README.md`, `docs/PROJECT_STATE.md`, `docs/ACTIVE_PLAN_CHECKPOINT.md`.
- Mobile EAS, TestFlight, menu/cart, purchase-flow, notifications, Apple Pay, payment recovery, and app-release automation documentation.
- Current mobile routes/providers, app config, EAS config, SDK contracts, and relevant backend routes/tests.

## Expected outputs

- Scoped mobile implementation and tests.
- Device/environment matrix and validation evidence.
- Explicit API/contract requests to Platform.
- Release handoff identifying profiles, native changes, versions, credentials needed, and exact worktree/base/diff; add the candidate SHA when Release creates it.

## Handoff responsibilities

Document affected platforms, routes, profiles, bundle/app identity, API environment, native dependencies, checkout/auth state, tests, manual device checks, and release implications. Never include secrets.

## Stop and request another agent when

- Backend/API/payment settlement or app-identity persistence must change.
- Product/design intent is unclear.
- A native credential, external console action, build, or submission is required.
- Security review is required for session/payment/deep-link changes.
- Shared token work materially affects web.

## Explicit user approval required

- New merchant app identity/bundle/release scope not already authorized.
- Native capability or dependency with material privacy/security impact.
- Real EAS/App Store/TestFlight build or submission when not already explicitly authorized.
- Any production release action.
