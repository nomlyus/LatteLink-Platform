# Nomly status

**As of 2026-11-16.** Update this page whenever something below stops being true. It is the one "where are we" page. The plan lives in [ROADMAP.md](../ROADMAP.md) and issue #466; system details are in [ARCHITECTURE.md](../ARCHITECTURE.md).

## In one paragraph

Nomly is live with one merchant, **Rawaq** (Ann Arbor), on production release **v1.0.13**. Since then, about 166 commits of the **Nomly V2** product have landed on `develop`: Operator Dashboard V3 rebuilt in React, a relational catalog, brand/location isolation, brand-wide loyalty, owner onboarding, and the Expo SDK 58 app upgrade. None of it is in production yet. V2 is mostly *built* but not *accepted*. The biggest remaining engineering item is per-brand customer accounts (#536), which must land before the second merchant, **Hazel**, can launch.

## Environments

| | Production | Dev |
|---|---|---|
| Branch | `main` (moves only for a release) | `develop` (all work lands here) |
| API | `api.nomly.us`, Heroku `nomly-api-prod` (Basic dyno) | `api-dev.nomly.us`, Heroku `nomly-api-dev` (Eco dyno, sleeps when idle) |
| Database | Supabase production project | Supabase dev project |
| Running | `v1.0.13` (released 2026-09-04) | latest `develop`; deploy, smoke check and checkout E2E green on 2026-11-16 |
| Payments | Stripe live (Connect) | Stripe test mode |

## Where V2 is (gates from #466)

| Gate | Meaning | State |
|---|---|---|
| G0 | Verified baseline | Done (closed 2026-09-23) |
| G1 | Trustworthy Rawaq journey on dev | Done (closed 2026-09-24) |
| **G2** | Complete V2 product, incl. Dashboard V3 | **In progress**: built, needs acceptance and #536 |
| G3 | Repeatable client onboarding and release | Not started in code since Sept |
| V2-RELEASE (#532) | Promote `develop` → `main`, tag, deploy | Waiting on G2 and G3 |
| G4 | Client #2 (Hazel) live on V2 | After release |

### G2 detail

| Item | Built on develop | Left to do |
|---|---|---|
| Dashboard V3 shell, Owner Home, Orders, Menu, Team, Settings (#423, #422, #426, #425, #431, #427) | Yes, React migration done (#535) | QA/acceptance; **Rawaq staff service-floor test** for Orders |
| Discounts (#429) | Dashboard + mobile code-entry field | Checkout edge cases, acceptance |
| Brand-wide loyalty programs (#215) | Backend and contracts (migration 0059) | **Dashboard UI to configure the program** |
| Branded multi-location customer app (#428) | Done (closed 2026-09-29) | n/a |
| Customer-app quality (#430) | Purchase and refund passed on TestFlight 1.2.0 (34) | Apple Pay, accessibility, **retest after SDK 58** |
| Per-brand customer accounts (#536) | **Not started** | All of it |
| News Cards / App Builder (#424) | App Builder was removed from V2 on 2026-09-28 | Rescope the issue |

## Known problems

- **Dependency audit (`security-deps`) fails on every `develop` CI run.** The 5 open Dependabot PRs (#323–#340) are stale and target `main`; redo the bumps on `develop`.
- **Dev uptime alerts are mostly noise.** The Eco dyno sleeps and the monitor times out at 10 s, producing about 90 auto-opened/auto-closed issues since 2026-09-26. Draft PR #506 is related.
- **Automatic dev deploys run `main`'s copy of `deploy-dev.yml`.** Until the next release, if one fails at the Heroku Git ref check, rerun it manually: `gh workflow run deploy-dev.yml --ref develop`.
- **`deploy-prod.yml` got the same Heroku-ref wait fix on `develop` (2026-11-16)**, but it is untested until the next production release.
- **Local setup:** Node 25 has no `corepack`, which the mobile `postinstall` calls. Use Node 22 or install corepack.

## Open decisions

- Operator Apple sign-in and passkeys (#360–#362): Gate 3 or deferred?
- The AWS/ECS/Terraform backlog (#230, #269–#273, #313, #235): close as superseded by ADR 0002, or keep as deferred?
- `devRefactor` branch (gateway transport refactor, 1 commit): keep or drop?
- #424: rewrite as News Cards only, or close?
- Security contact: `SECURITY.md` still lists `security@gazellecoffee.com`.
