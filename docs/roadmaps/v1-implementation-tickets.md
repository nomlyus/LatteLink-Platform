# V1 Implementation Tickets

Last updated: `2026-04-01`

## Purpose

This document turns the `V1` roadmap and execution backlog into concrete implementation tickets by surface.

Use these tickets as the working build plan for pilot-production readiness.

## V1 Definition

`V1` means:

- one real client/store can run on the platform
- customer mobile ordering works end to end
- the client dashboard is usable by store owner and staff
- deployment is reproducible
- onboarding is intentional, not improvised

## Recommended Release Order

1. backend foundation and deploy readiness
2. mobile pilot reliability
3. client dashboard production readiness
4. LatteLink web conversion and truthfulness
5. admin console V1 foundations

## Ticket Format

Each ticket includes:

- goal
- scope
- key deliverables
- dependencies
- acceptance criteria

## Ownership Model

For V1, assume all engineering delivery in this document is owned by `Codex`.

That means:

- implementation
- refactors
- verification
- workflow changes
- docs updates
- local commits

User-side work only applies where Codex cannot act directly, such as:

- third-party account creation
- domain/DNS changes
- provider credentials
- store/client business decisions
- platform secrets that only the account owner can supply

Unless you explicitly reprioritize the work, Codex should execute the tickets in critical-path order.

## Status Convention

Per-ticket status below is now the source of truth.

- `owner`: Codex
- `status`: current execution state for that ticket
- `done`: what is implemented and verified locally
- `blocked`: external rollout or provider work still required

## Backend Platform Tickets

### BE-V1-01 Free-First Deployment Alignment

Status:

- `owner`: Codex
- `status`: repo-complete, locally validated
- `done`: aligned `deploy-free`, `infra/free/.env.example`, GHCR namespace usage, Caddy/runtime env wiring, and the free-first smoke check path
- `blocked`: first live deploy still needs the target host, GitHub deploy secrets/vars, published GHCR images, and a real remote smoke-check transcript

Goal:
Make the DigitalOcean/free-first deployment path reliable enough for a real pilot run.

Scope:

- align `deploy-free` workflow inputs with runtime `.env` needs
- confirm GHCR image paths and tags
- confirm remote compose startup is deterministic
- validate Caddy, gateway, and service health checks

Key deliverables:

- corrected deploy workflow behavior
- verified `infra/free/.env.example`
- documented runtime secret/variable matrix
- first successful remote deployment and smoke-check transcript

Dependencies:

- GitHub secrets and vars
- live target host

Acceptance criteria:

- `deploy-free` can bring the stack up without manual host edits
- `/health` and `/ready` pass on the deployed API
- rollback steps are documented and realistic

### BE-V1-02 Persistence and Restore Hardening

Status:

- `owner`: Codex
- `status`: repo-complete, locally validated
- `done`: added backup/restore drill tooling, migration coverage through the current schema, restore verification scripts, and the free-first restore runbook
- `blocked`: a real backup/restore rehearsal still has to be executed on the deployed host and recorded against pilot data

Goal:
Make production data survivable for a pilot.

Scope:

- validate Postgres and Valkey runtime configuration
- confirm migrations run cleanly
- execute backup/restore drill
- remove or explicitly isolate any in-memory-only behavior from pilot-critical paths

Key deliverables:

- successful migration run on the deployment target
- documented backup/restore procedure
- restore validation evidence

Dependencies:

- live deployed environment

Acceptance criteria:

- backup can be created and restored
- key entities still validate after restore:
  - users
  - orders
  - operator accounts
  - menu data

### BE-V1-03 Order and Payment Production Hardening

Status:

- `owner`: Codex
- `status`: repo-complete, locally validated
- `done`: hardened timeout/reconciliation handling, updated payment recovery docs, and revalidated the happy-path customer quote/create/pay/get flow against the live local stack in simulated-provider mode
- `blocked`: real Clover credentials, Apple Pay live validation, webhook secrets, and production reconciliation procedures still depend on external provider setup

Goal:
Make the order/payment path safe for real use.

Scope:

- confirm quote/create/pay flows
- verify idempotency behavior
- validate Clover and Apple Pay pilot path
- confirm order timeline correctness across success and failure paths

Key deliverables:

- tested happy path and failure path matrix
- validated idempotency handling
- production runbook updates for payment/order recovery

Dependencies:

- payment provider credentials
- deployed environment

Acceptance criteria:

- duplicate payment attempts do not produce broken orders
- failed payment states are supportable
- paid orders move into the expected lifecycle cleanly

### BE-V1-04 Client and Store Capability Config Foundation

Status:

- `owner`: Codex
- `status`: validated locally
- `done`: centralized typed store capability config and verified that dashboard behavior can be switched centrally through store config, including staff-mode fulfillment during live QA
- `blocked`: live pilot store capability choices still need to be finalized and applied in the deployed environment

Goal:
Stop relying on scattered assumptions for pilot client behavior.

Scope:

- define minimal typed client/store capability config for V1
- expose:
  - menu source
  - fulfillment mode
  - staff dashboard availability
  - loyalty visibility
- ensure mobile and client dashboard consume the same config

Key deliverables:

- typed config structure
- validated config loading
- app-config response reflecting the active store setup

Dependencies:

- catalog/config surface

Acceptance criteria:

- one store’s capabilities can be changed centrally
- mobile and dashboard reflect the same authoritative behavior

### BE-V1-05 Client Dashboard Auth and Capability Enforcement Closeout

Status:

- `owner`: Codex
- `status`: validated locally
- `done`: password auth, session refresh/logout, owner vs staff boundaries, staff order updates, owner staff management, and admin route capability enforcement all passed against the live local stack
- `blocked`: Google SSO production rollout is still separate and depends on real dashboard/public-domain credentials

Goal:
Make owner/staff access safe enough for a pilot.

Scope:

- verify password auth
- verify operator session refresh/logout
- verify gateway capability enforcement on all admin routes
- confirm owner-only and staff-only boundaries

Key deliverables:

- tested role/capability matrix
- cleaned-up auth edge-case handling
- stable session/me/refresh behavior

Dependencies:

- identity and gateway services

Acceptance criteria:

- staff cannot reach owner-only routes
- invalid or expired sessions fail clearly
- owner can manage staff and store settings

### BE-V1-06 Observability and Operational Smoke Checks

Status:

- `owner`: Codex
- `status`: validated locally, live rollout blocked
- `done`: request-id propagation and the smoke-check path are in place, and the smoke check now passes end to end locally after fixing the operator sign-in token capture
- `blocked`: deployed-stack log tracing, metrics review, and live release-checklist execution still depend on the real hosted environment

Goal:
Make the pilot operable when things go wrong.

Scope:

- structured logs for critical mutations
- request-id propagation
- smoke checks for deploy and release
- minimal metrics visibility for auth, orders, payments, and integrations

Key deliverables:

- updated smoke-check runbook
- request-id discipline across gateway and services
- baseline operational dashboard or checklist

Dependencies:

- deployed stack

Acceptance criteria:

- a failed pilot action can be traced across services
- release verification has a repeatable checklist

## Customer Frontend Mobile Tickets

### MF-V1-01 Session and Auth Hardening

Status:

- `owner`: Codex
- `status`: repo-complete, code-health validated
- `done`: session recovery/auth hardening is implemented and the mobile app currently passes `lint`, `typecheck`, and `test`
- `blocked`: real device relaunch and expired-session QA is still needed against a running pilot environment

Goal:
Make customer auth stable across real use.

Scope:

- startup session hydration
- refresh behavior
- explicit expired-session recovery
- sign-out reliability

Key deliverables:

- stable session lifecycle
- better auth failure messaging
- reduced auth-related dead ends

Dependencies:

- identity backend stability

Acceptance criteria:

- relaunching the app restores a valid session
- expired sessions recover or sign out clearly

### MF-V1-02 Pilot Purchase Flow QA

Status:

- `owner`: Codex
- `status`: partially validated locally
- `done`: the backend happy-path purchase flow passed live QA and the mobile checkout/cart test suite passes locally
- `blocked`: full browse-to-order QA on an actual device, including Apple Pay handoff and customer-visible failure states, still needs a pilot build and real device run

Goal:
Make browse-to-order flow reliable for real customers.

Scope:

- menu browse
- cart behavior
- checkout validation
- Apple Pay payment handoff
- order history and active-order rendering

Key deliverables:

- tested critical-path QA matrix
- fixed checkout/cart regressions
- cleaned-up customer-visible errors

Dependencies:

- backend payment/order stability

Acceptance criteria:

- a pilot customer can complete the full flow on a real device
- common failure states are understandable and recoverable

### MF-V1-03 Production Environment and Build Wiring

Status:

- `owner`: Codex
- `status`: repo-complete, external rollout blocked
- `done`: the EAS/build-matrix groundwork is in the repo and documented for internal, beta, and production style builds
- `blocked`: final API/payment env values, EAS credentials, and the real pilot build secrets still need to be supplied externally

Goal:
Make pilot builds safe and repeatable.

Scope:

- API config
- payment config
- notification config
- EAS build profile setup

Key deliverables:

- formal build env matrix
- `internal` / `beta` / `production` profiles
- release checklist for TestFlight

Dependencies:

- chosen pilot environment URLs and secrets

Acceptance criteria:

- a fresh build can be produced without guessing env inputs
- internal and pilot builds point to the intended backend

### MF-V1-04 Active Order Experience Hardening

Status:

- `owner`: Codex
- `status`: repo-complete, code-health validated
- `done`: post-purchase/order-detail hardening is implemented and covered by the current mobile test suite
- `blocked`: real device validation against live order progression is still needed once the pilot environment is up

Goal:
Make post-purchase experience credible during the pilot.

Scope:

- active order states
- history detail states
- refresh affordances
- error and empty states

Key deliverables:

- refined active-order UI copy and rendering
- no confusing stuck or blank states
- support-friendly order detail visibility

Dependencies:

- order lifecycle consistency

Acceptance criteria:

- after payment, users can understand order progress
- support can ask users to verify expected details in-app

### MF-V1-05 TestFlight Pilot Release

Status:

- `owner`: Codex
- `status`: blocked on external release setup
- `done`: the runbook/release groundwork is in place for a controlled pilot release
- `blocked`: Apple developer/TestFlight setup, signed builds, tester distribution, and the first live candidate release are external steps

Goal:
Get the first real customer build into controlled hands.

Scope:

- build distribution
- QA pass
- release notes
- pilot feedback loop

Key deliverables:

- first TestFlight candidate
- pilot verification checklist
- known-issues list and rollback plan

Dependencies:

- completed V1 mobile tickets

Acceptance criteria:

- the app is installable and usable by pilot testers
- the team has a clear way to gather and triage pilot feedback

## Client Dashboard Tickets

### CD-V1-01 Dashboard QA and Bug Scrub

Status:

- `owner`: Codex
- `status`: validated locally
- `done`: full live local QA now passes for owner and staff flows, and the client dashboard currently passes `lint`, `typecheck`, `test`, and `build`
- `blocked`: deployed-browser QA on the real dashboard URL still depends on the production deploy lane being configured

Goal:
Make the current dashboard safe enough for daily store use.

Scope:

- auth screen
- overview
- orders
- menu
- team
- settings
- owner vs staff behavior

Key deliverables:

- full local QA pass
- prioritized bug list
- fixes for pilot-blocking issues

Dependencies:

- backend auth/admin routes

Acceptance criteria:

- owner and staff can complete their core flows without engineering intervention

### CD-V1-02 Production Deploy Lane and Domain

Status:

- `owner`: Codex
- `status`: repo-complete, external rollout blocked
- `done`: the dashboard deployment lane was moved to Vercel and the project now has a dedicated workflow and runbook
- `blocked`: Vercel project setup, secrets, custom domain, and a public API base URL still have to be configured externally

Goal:
Make the client dashboard deployable independently.

Scope:

- Vercel deployment workflow
- static build deployment on Vercel
- domain/TLS plan
- smoke-check path

Key deliverables:

- working deployment lane
- required GitHub secret/var setup list
- deployment runbook

Dependencies:

- Vercel project
- public API or tunnel target

Acceptance criteria:

- dashboard can be deployed and loaded via its real URL
- smoke checks pass after deployment

### CD-V1-03 Owner Provisioning and First-Time Access

Status:

- `owner`: Codex
- `status`: validated locally
- `done`: internal client/location bootstrap and first-owner provisioning passed live QA without raw DB work, and the supporting backend paths are in place
- `blocked`: the final operator runbook for live onboarding still depends on the deployed admin/dashboard surfaces and chosen pilot process

Goal:
Make first-owner access deliberate and repeatable.

Scope:

- define how a new client/store owner gets access
- temporary password flow
- optional Google-first flow for provisioned accounts
- runbook for first-time login

Key deliverables:

- owner onboarding runbook
- provisioning checklist
- default first-time access pattern

Dependencies:

- backend provisioning path

Acceptance criteria:

- a new owner can be granted access without raw DB improvisation

### CD-V1-04 Google SSO Production Setup

Status:

- `owner`: Codex
- `status`: code-ready, production-config blocked
- `done`: Google SSO code paths and provider discovery are in place, and local provider status correctly reports `configured: false` when creds are absent
- `blocked`: Google OAuth client credentials, redirect URIs, and a public dashboard domain are still required before end-to-end validation can happen

Goal:
Make Google sign-in usable for real store accounts where needed.

Scope:

- Google OAuth credentials
- redirect URIs
- identity env setup
- first-time linking policy for pre-provisioned emails

Key deliverables:

- working Google auth configuration
- tested first-time sign-in for a provisioned owner
- clear failure behavior for unknown accounts

Dependencies:

- identity Google SSO code
- public dashboard domain

Acceptance criteria:

- a provisioned store account can sign in with Google
- non-provisioned Google users are denied cleanly

### CD-V1-05 Menu, Store, and Team Final Hardening

Status:

- `owner`: Codex
- `status`: validated locally
- `done`: owner menu/store/team CRUD and staff permission boundaries passed the live local QA matrix, including store capability updates and staff order-status progression
- `blocked`: final polish against the deployed browser experience still depends on the production dashboard rollout

Goal:
Make the admin actions feel finished enough for the pilot.

Scope:

- menu create/edit/delete/visibility
- store settings updates
- team create/update/deactivate
- permission-aware empty and disabled states

Key deliverables:

- polished CRUD flows
- safe destructive-action handling
- clearer permission and feature-flag messaging

Dependencies:

- backend admin APIs

Acceptance criteria:

- owner workflows feel complete
- staff cannot access owner-only actions

## Admin Console Tickets

### AC-V1-01 Admin Console Product and Architecture Definition

Status:

- `owner`: Codex
- `status`: complete
- `done`: the internal admin-console product/architecture direction is documented and the V1 target is defined
- `blocked`: no repo-side blocker remains on the definition ticket

Goal:
Define what the internal console must do in V1.

Scope:

- internal-user roles
- information architecture
- deployment target
- authentication approach

Key deliverables:

- admin-console product spec
- route/screen map
- architecture decision

Dependencies:

- backend tenant direction

Acceptance criteria:

- the team has a clear V1 internal-console build target

### AC-V1-02 Internal Provisioning Backend APIs

Status:

- `owner`: Codex
- `status`: validated locally
- `done`: internal client/location bootstrap and owner-provision APIs are implemented and passed live QA against the local stack
- `blocked`: live operational use still depends on deployed internal access and real platform-admin credentials

Goal:
Build the backend capabilities the admin console will need first.

Scope:

- client/organization provisioning
- location provisioning
- owner provisioning
- feature/config initialization

Key deliverables:

- documented API surface for internal admin operations
- validated org/location/owner bootstrap path

Dependencies:

- backend tenant/config work

Acceptance criteria:

- platform admins can provision a new pilot client through supported APIs

### AC-V1-03 Initial Internal App Shell

Status:

- `owner`: Codex
- `status`: repo-complete, code-health validated
- `done`: the admin-console shell is scaffolded and currently passes `lint`, `typecheck`, and `build`
- `blocked`: internal hosting, auth rollout, and real platform-admin browser QA are still external steps

Goal:
Start the internal control plane instead of leaving it theoretical.

Scope:

- scaffold app
- internal auth
- basic onboarding views

Key deliverables:

- app shell
- secure internal access
- placeholder flows for organization/location/owner creation

Dependencies:

- AC-V1-01
- AC-V1-02

Acceptance criteria:

- the LatteLink team can log into an internal console and see the first control-plane surface

## LatteLink Web Tickets

### LW-V1-01 Booking and Contact CTA Flow

Status:

- `owner`: Codex
- `status`: repo-complete, deployment follow-through blocked
- `done`: the site now includes a real lead-capture/intro path instead of a dead-end CTA, and the app currently passes `lint`, `typecheck`, and `build`
- `blocked`: production lead routing and live CTA verification still depend on the chosen outbound handling and production env setup

Goal:
Turn the site into a usable outreach surface, not just a visual page.

Scope:

- replace weak CTA paths
- introduce a real booking/contact mechanism
- clarify next steps after form submission

Key deliverables:

- working CTA flow
- lead handoff path
- clear success state

Dependencies:

- chosen booking/contact tool

Acceptance criteria:

- an interested lead can convert without dead-ending on a mailto link

### LW-V1-02 Trust and Proof Pass

Status:

- `owner`: Codex
- `status`: complete
- `done`: trust/proof messaging was tightened to remove weaker aspirational signals and better match the actual product state
- `blocked`: no repo-side blocker remains beyond future copy refinements as the pilot story evolves

Goal:
Make the homepage credible to cold traffic.

Scope:

- remove or validate weak proof claims
- add real proof, founder trust, or pilot details
- align copy with actual product state

Key deliverables:

- updated trust/proof sections
- tighter positioning copy
- reduced aspirational/fake-signal risk

Dependencies:

- real pilot/company facts

Acceptance criteria:

- the site no longer overclaims relative to the current platform reality

### LW-V1-03 Analytics and SEO Baseline

Status:

- `owner`: Codex
- `status`: repo-complete, external config blocked
- `done`: analytics hooks, CTA tracking, metadata, manifest, sitemap, robots, and social image baseline are in place, and the site build is green
- `blocked`: production analytics still needs a real measurement ID and live verification in Vercel

Goal:
Make the site measurable and discoverable.

Scope:

- analytics hooks
- CTA event tracking
- metadata review
- indexability review

Key deliverables:

- analytics baseline
- SEO sanity pass
- event coverage for core CTA paths

Dependencies:

- chosen analytics platform

Acceptance criteria:

- you can measure visits, CTA interactions, and conversion starts

## V1 Critical Path

The shortest honest path to V1 is:

1. `BE-V1-01`
2. `BE-V1-02`
3. `BE-V1-03`
4. `BE-V1-05`
5. `MF-V1-01`
6. `MF-V1-02`
7. `CD-V1-01`
8. `CD-V1-02`
9. `CD-V1-03`
10. `LW-V1-01`

Optional-but-likely within V1:

- `CD-V1-04`
- `LW-V1-02`
- `MF-V1-05`

## After This Document

The next useful execution step is to move the still-blocked items out of repo work and into rollout work:

- backend host, secrets, GHCR image publish, and live smoke-check
- Vercel setup for the client dashboard
- Google OAuth credentials and redirect URIs
- mobile pilot builds and TestFlight distribution
- final live browser/device QA on the deployed pilot surfaces
