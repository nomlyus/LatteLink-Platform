# Technical Debt Register

Last verified: 2026-11-16, against `develop` code and closed issues.
Each entry is: ID, where it is, what's wrong, and the way out. IDs from the April register are kept; new items start at TD-24.

## Open

### High

**TD-07: Operator email is unique across all merchants**
`operator_users_email_unique_idx` (migration 0011). One person can't hold operator accounts at two different merchants with the same email. Matters once there are 2+ merchants.
Way out: scope uniqueness to brand, or use one operator identity with multi-brand access (`operator_location_access` already models locations).

**TD-24: Customer identity is global, not per brand**
`identity_users` is platform-wide and has no brand membership. A customer of Rawaq would carry account state into Hazel's app.
Way out: #536 (G2, p0). Required before client #2.

**TD-25: Dependency audit fails on `develop`**
The `security-deps` job fails on every run; 5 Dependabot PRs (#323–#340) are stale and target `main`.
Way out: one consolidated dependency bump on `develop`, then close the stale PRs.

### Medium

**TD-06: One dyno per environment, no failover**
Heroku `nomly-api-prod` is a single Basic dyno running the whole backend; dev is an Eco dyno that sleeps. A dyno restart is an outage.
Way out: accepted for now (ADR 0002). Scale on the triggers in #455.

**TD-15: Loyalty program not configurable from the dashboard**
The backend supports brand-wide programs (`loyaltyProgramSchema`, migration 0059), but the merchant dashboard has no screen to set them up.
Way out: #215.

**TD-26: Automatic dev deploys run `main`'s workflow file**
`deploy-dev.yml` is triggered by `workflow_run`, which GitHub always reads from the default branch (`main`). Workflow fixes made on `develop` don't apply to automatic dev deploys until the next release.
Way out: either accept it (manual `gh workflow run deploy-dev.yml --ref develop` as a fallback) or change the repo's default branch to `develop`.

**TD-27: "Gazelle" names left in code**
`GazelleApiClient` in `packages/sdk-mobile`, the mobile session storage key `gazelle.auth.session.v1`, and test fixtures.
Way out: rename the client class freely. Change the storage key only with a migration that reads the old key, or every customer gets signed out.

**TD-16: Passkey routes exist but enrollment is disabled**
`services/identity`: registration isn't safely bound to the signed-in customer. No mobile UI.
Way out: fix account binding and get a security review before exposing it (#213).

### Low

**TD-23: Two migrations share the `0015` prefix**
`0015_home_news_cards.ts`, `0015_identity_customer_birthday.ts`. A test now guards against new duplicates.
Way out: leave as is; renaming risks re-running migrations on existing databases.

**TD-28: Legacy code paths still in source**
Clover payment/OAuth code in `services/payments` (unavailable since Nomly 1.2.0), the `time_based` fulfillment mode (test-only), `infra/free` Compose deploy scripts (only `bin/smoke-check.sh` is still used by deploys), and Terraform modules that were never deployed.
Way out: remove what nothing calls. Keep Clover only if the read-only reporting import (#290) is still planned.

**TD-17: Admin console promises an owner reset flow that doesn't exist**
`apps/admin-console/src/app/(console)/clients/[locationId]/owner/page.tsx:132` mentions "future reset flows".
Way out: remove the copy until the feature exists.

**TD-29: Mobile `postinstall` requires `corepack`**
`apps/mobile/package.json` calls `corepack pnpm`; Node 25 doesn't ship corepack, so local installs fail there.
Way out: call `pnpm` directly, or pin Node 22 via `.nvmrc`.

## Accepted (by design, not debt)

**TD-12: One app build per merchant brand.** Each brand has its own App Store app. This is the product model (#466).

## Resolved

| ID | Item | How |
|---|---|---|
| TD-01 | Time-based fulfillment default | Default is `staff` (`DEFAULT_APP_CONFIG_FULFILLMENT`); v1.0.0 |
| TD-02 | Loyalty not merchant-scoped | Brand-wide loyalty, migration 0059 |
| TD-03 | R2 media upload unproven | #199 closed |
| TD-04 | Order SSE polled alongside the event bus | #200 / #265 closed. On Heroku there is no Valkey, so polling is the intended path (ADR 0002) |
| TD-05 | No error tracking or alerting | Sentry (`packages/observability`), uptime monitor; v1.0.0 |
| TD-08 | No stale-payment recovery | Payment reconciler worker; v1.0.0, fixed in v1.0.13 |
| TD-09 | No absolute session TTL | #202; v1.0.0 / v1.0.9 |
| TD-10 | Dev and prod not separated | Separate Heroku apps and Supabase projects; v1.0.0 / v1.0.12 |
| TD-11 | Hardcoded Rawaq defaults | #210; only `LOCAL_FIXTURE_*` constants remain for local dev |
| TD-13 | Fallback menu data in the mobile app | #204; `src/menu/catalog.ts` now only holds query hooks, no fallback data |
| TD-14 | No push receipt polling | #217 (G1-11) |
| TD-18 | Stale architecture overview | Rewritten as `ARCHITECTURE.md`; old doc archived (2026-11-16) |
| TD-19 | Empty changelog | Backfilled through v1.0.13 (2026-11-16) |
| TD-20 | `repo-files.md` | Archived (2026-11-16) |
| TD-21 | Deprecated bootstrap code in persistence | #237 closed |
| TD-22 | Sprint notes in `docs/implementation` | Archived (2026-11-16) |
