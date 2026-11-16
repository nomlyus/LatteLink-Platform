# Roadmap

**Source of truth: GitHub issue #466.** This page summarizes it; if they disagree, #466 wins, so update this page. Current progress is in [docs/STATUS.md](docs/STATUS.md).
The April 2026 roadmap (Gates 1–3: pilot safety / polish / Growth OS) is retired and archived in [docs/archive/2026-04-planning](docs/archive/2026-04-planning). Its gate numbers do **not** match the ones below.

## Product direction

- Nomly serves independent cafés. Rawaq is the live merchant; Hazel is planned as client #2.
- Nomly owns the full order lifecycle. Fulfillment is pickup-first and run from the Nomly dashboard.
- Each merchant brand gets its own branded iOS app, with location selection inside it.
- Loyalty is brand-wide.
- Merchants pay a subscription only.
- Client #2 is onboarded concierge-style, with the full branded iOS system.
- Clover is deferred; at most a read-only reporting import later.

## Two release trains

"V3" means two different things in this repo:

- **Operator Dashboard V3**: the third design of the merchant dashboard. **It ships in Nomly V2.**
- **Nomly V3**: the product release *after* V2 (#533).

## Nomly V2

| Gate | Goal | Exit issue | State |
|---|---|---|---|
| G0 | Verified baseline | #406 | Done |
| G1 | Trustworthy Rawaq journey on live dev | #421 | Done |
| G2 | Complete V2 product candidate, incl. Dashboard V3 | #432 | In progress |
| G3 | Repeatable client onboarding and release factory | #440 | Not started |
| **V2-RELEASE** | Promote `develop` → `main` and release to production | #532 | Blocked on G2, G3 |
| G4 | Client #2 live and stable on V2 | #465 | After release |

**G2 work:** Dashboard V3 shell/Home/Orders/Menu/Team/Settings (#423, #422, #426, #425, #431, #427), discounts (#429), brand-wide loyalty programs (#215), branded-app management (#424), customer-app quality (#430), per-brand customer accounts (#536).

**G3 work:** onboarding playbook (#434), zero-to-ready merchant bootstrap (#437), menu intake (#435), Stripe Connect onboarding (#436), iOS identity/assets/metadata (#433), automated iOS build and submission (#356), release approvals and rollback (#441), disposable second-brand rehearsal (#439), client #2 sales package (#438), onboarding tracking (#294).

**Release gate (#532):** record the exact candidate SHA, approvals, prerequisites, migration provenance (benchmark catalog migrations, #531), Postgres TLS (#516), and the rollback point before promoting.

## Nomly V3 (after #532 closes)

| Gate | Goal | Exit issue |
|---|---|---|
| G5 | Five-brand proof and V3 capabilities: launch template, clients #3–5, Android, ops console, tenant re-verification, billing, customer profiles, campaigns, analytics, segments | #448 |
| G6 | Public launch: positioning, pricing, legal, onboarding entry, accessibility, security review, drills, launch story | #461 |
| NOMLY-V3-RELEASE | Release | #533 |

## Rules

- All work lands on `develop`. `main` moves only for a release.
- A later gate can be explored early, but can't be approved before its dependencies.
- Safety, security, data-loss, or production-readiness findings can be pulled into the active release when evidence requires it.
- Every production change needs a release issue and a recorded rollback plan.

## Not yet

Carried forward from the April roadmap; still valid unless real demand changes it.

- Email or SMS campaigns (no provider, compliance, or volume yet)
- POS integrations (Toast/Square: #291, #292) without a merchant asking
- Kubernetes, multi-region, read replicas: Heroku single dyno until the triggers in ADR 0002 / #455
- New microservices: extend the existing service boundaries
- A/B testing, AI recommendations: need months of real data first
