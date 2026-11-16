# Changelog

Production releases of the Nomly platform. Each entry is a GitHub Release `vX.Y.Z` deployed from `main`. Policy: [docs/runbooks/development-flow.md](docs/runbooks/development-flow.md). Full notes are on the GitHub Releases page.

## Unreleased (on `develop`)

The Nomly V2 candidate (see [docs/STATUS.md](docs/STATUS.md)), including:

- Operator Dashboard V3, rebuilt in React/Next.js: owner home, orders, menu, team, settings, discounts, news cards, owner onboarding.
- Relational catalog model and relational order location.
- Brand and location isolation across public, customer, and operator APIs.
- Brand-wide loyalty balances and program contracts.
- Branded, multi-location customer app; Expo SDK 58 and native UI refresh.
- Operator full refunds.
- Deploy fixes (2026-11-16): backend images include pnpm patches; the checkout E2E sends `brandId`; dev and prod deploy workflows wait for Heroku's Git ref after a push.

## v1.0.13 (2026-09-04)

- Restored background payment reconciliation for UUID order and checkout references stored as text. Invalid legacy references no longer fail the whole batch.

## v1.0.12 (2026-09-04)

- Production backend restored on Heroku. Gateway and domain services are packaged into one runtime, with release-phase migrations; data stays in external Supabase.
- Release metadata is forwarded correctly to the production policy gate. Supersedes v1.0.11.

## v1.0.11 (2026-09-04)

- Backend migration from the retired DigitalOcean hosts to a single-dyno Heroku runtime. Its deploy stopped at the release-policy gate; replaced by v1.0.12.

## v1.0.10 (2026-08-16)

- Checkout drafts are created before payment and become orders only after verified payment, so canceled payment sheets no longer create orders.
- Clearer checkout failure copy. Dependency updates. iOS version aligned to 1.0.10.
- Added the deployed dev checkout E2E after dev deploys.

## v1.0.9 (2026-06-20)

- Fixed-length random refresh tokens for customers, operators, and internal admins; bounded token validation.
- Patched Vite, ws, and undici advisories.

## v1.0.8 (2026-06-15)

- Dashboard save alerts auto-dismiss after five seconds. Patched esbuild.

## v1.0.7 (2026-06-12)

- New-order sound alerts on the store order screen, with explicit browser audio activation.
- Mobile text scaling locked to protect layouts. Dashboard team and capability fixes.

## v1.0.6 (2026-06-01)

- Rawaq production mobile build: branding, splash, Apple Pay entitlements, iOS production config.
- Loyalty earns one point per dollar.
- No catalog fallback for unknown or half-configured locations.
- Session, auth, order/payment, and rate-limit hardening; GitHub Release object gate for production deploys.

## v1.0.5 (2026-06-01)

- Tag only (no GitHub Release): automated main release tagging and security hardening; included in v1.0.6.

## v1.0.4 (2026-05-20)

- Stripe Connect onboarding replaces inaccessible sandbox account IDs with live Express accounts.

## v1.0.3 (2026-05-20)

- Stripe Connect hardened for live mode: auto-refresh of expired onboarding links, fail-fast on test/mixed keys.

## v1.0.2 (2026-05-09)

- Tag only (no GitHub Release): client dashboard setup moved into settings, simpler onboarding, refreshed SDK types.

## v1.0.1 (2026-05-04)

- Capped Postgres client pools for DB-backed services to keep the free Supabase session pool below its client limit.
- Added configurable Postgres pool timeout settings for safer overload behavior.

## v1.0.0 (2026-04-28)

- Released the Gate 1 pilot-safety baseline after production deploy validation.
- Added dev/prod environment separation, automated deploy workflows, and restore-drill validation.
- Shipped pilot readiness systems: structured logging, Sentry, uptime checks, launch readiness, stale payment reconciliation, loyalty scoping, tenant-isolation hardening, and support tooling.
