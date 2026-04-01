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

## Backend Platform Tickets

### BE-V1-01 Free-First Deployment Alignment

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

Goal:
Make the client dashboard deployable independently.

Scope:

- free-host deployment workflow
- static build deployment
- domain/TLS plan
- smoke-check path

Key deliverables:

- working deployment lane
- required GitHub secret/var setup list
- deployment runbook

Dependencies:

- public host
- public API or tunnel target

Acceptance criteria:

- dashboard can be deployed and loaded via its real URL
- smoke checks pass after deployment

### CD-V1-03 Owner Provisioning and First-Time Access

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

The next useful planning step is to assign:

- owner
- target week
- current status
- blocker

for each ticket above.
