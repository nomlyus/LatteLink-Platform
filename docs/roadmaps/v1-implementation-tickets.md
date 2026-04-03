# V1 Implementation Tickets

Last updated: `2026-04-03`

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
- `done`: aligned `deploy-free`, `infra/free/.env.example`, GHCR namespace usage, added the missing service-image publish workflow and Docker build path, tightened host bootstrap guidance, and validated the free-first smoke check path
- `blocked`: first live deploy still needs the target host, GitHub deploy secrets/vars, the first GHCR publish run, and a real remote smoke-check transcript

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
- `done`: hardened timeout/reconciliation handling, updated payment recovery docs, revalidated the happy-path customer quote/create/pay/get flow against the live local stack in simulated-provider mode, and wired the free-first deploy path for live Clover/Apple Pay configuration with rollout validation
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

### BE-V1-07 Clover Public OAuth and Webhook Routing Fix

Status:

- `owner`: Codex
- `status`: repo-complete, locally validated
- `done`: added public gateway passthrough for Clover OAuth status/connect/callback/refresh and webhook routes, preserved Clover redirect responses through the public API, accepted Clover verification callbacks before webhook auth enforcement, trusted `X-Clover-Auth`, and covered the new paths with targeted gateway/payments tests
- `blocked`: hosted Clover production app verification, production test-merchant install/connect flow, and live-mode rollout evidence remain tracked separately in `XS-V1-07`

Goal:
Make the deployed public API compatible with Clover's production OAuth launch/callback flow and webhook verification flow.

Scope:

- expose Clover OAuth and webhook routes through `gateway`
- preserve Clover redirect responses through the public API callback path
- accept Clover webhook verification payloads before normal webhook auth enforcement
- accept Clover's verified webhook auth header format in `payments`
- add regression coverage for the public gateway and webhook handshake paths

Key deliverables:

- gateway passthrough for Clover OAuth status/connect/callback/refresh routes
- public webhook forwarding for `POST /v1/payments/webhooks/clover`
- payments webhook verification-code acceptance
- support for Clover's `X-Clover-Auth` header
- targeted tests covering the new public route behavior

Dependencies:

- `BE-V1-03`

Acceptance criteria:

- `https://api.<domain>/v1/payments/clover/oauth/callback` can preserve Clover redirect behavior
- `https://api.<domain>/v1/payments/webhooks/clover` returns `200` for Clover verification payloads
- verified Clover webhook deliveries can authenticate through the public API path
- the repo-side Clover failure is resolved without changing the rollout ticket scope

### BE-V1-08 Clover Public Endpoint Rate Limiting

Status:

- `owner`: Codex
- `status`: repo-complete, locally validated
- `done`: added gateway-side rate limits to the public Clover OAuth status/connect/callback/refresh and webhook ingress routes, plus targeted regression coverage proving the limits trip cleanly
- `blocked`: none

Goal:
Protect the newly exposed public Clover ingress routes from avoidable abuse and accidental retry storms.

Scope:

- add dedicated gateway rate-limit buckets for public Clover OAuth reads
- add dedicated gateway rate-limit buckets for public Clover OAuth writes
- add dedicated gateway rate-limit buckets for public Clover webhook ingress
- verify the limits with route-level tests

Key deliverables:

- `gateway` rate-limit config for public Clover routes
- tests covering read, write, and webhook-limit behavior

Dependencies:

- `BE-V1-07`

Acceptance criteria:

- public Clover OAuth GET routes are rate limited at the gateway
- Clover OAuth refresh is rate limited at the gateway
- Clover webhook ingress is rate limited at the gateway before the request reaches `payments`

### BE-V1-09 Gateway Contract Artifact Drift Fix

Status:

- `owner`: Codex
- `status`: repo-complete, locally validated
- `done`: regenerated the committed gateway OpenAPI artifact and mobile SDK generated types after the Clover public-route additions, then reran the contract-compat coverage so the generated outputs match the live gateway surface again
- `blocked`: none

Goal:
Bring the committed gateway OpenAPI and generated SDK artifacts back in sync after the Clover public-route changes.

Scope:

- regenerate committed gateway OpenAPI artifacts after the Clover route additions
- regenerate the mobile SDK generated types from the updated gateway spec
- verify the contract-drift guard passes locally
- keep the fix scoped to generated artifacts and the tracking ticket

Key deliverables:

- updated `services/gateway/openapi/openapi.json`
- updated `packages/sdk-mobile/src/generated/types.ts`
- local contract-drift verification evidence

Dependencies:

- `BE-V1-07`

Acceptance criteria:

- committed gateway OpenAPI artifacts include the public Clover OAuth and webhook routes
- committed SDK generated types match the updated gateway OpenAPI spec
- the contract-drift guard no longer fails for the Clover public-route changes

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
- `done`: the EAS/build-matrix groundwork is in the repo and documented for internal, beta, and production style builds, and a profile-aware mobile release preflight now validates env safety before EAS build handoff
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
- `done`: the runbook/release groundwork is in place for a controlled pilot release, including the external value matrix needed for the first pilot TestFlight build
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
- `done`: Google SSO code paths, provider discovery, local env placeholders, and the rollout/runbook mapping to free-first deploy secrets are in place, and local provider status correctly reports `configured: false` when creds are absent
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
- `blocked`: live internal hosting, auth rollout, and platform-admin browser QA are deferred to `AC-V1-04`

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

### AC-V1-04 Live Internal Deployment, Auth Rollout, and Validation

Status:

- `owner`: Codex
- `status`: pending
- `done`: live rollout is intentionally separated from the repo-complete shell and tracked as its own external follow-through ticket
- `blocked`: requires Vercel hosting, internal auth env setup, backend `INTERNAL_ADMIN_API_TOKEN` rollout, and real platform-admin browser QA

Goal:
Turn the admin console from a validated shell into a usable live internal tool.

Scope:

- Vercel deployment for `apps/admin-console`
- internal admin auth environment configuration
- live internal API token rollout on the backend
- real browser validation for sign-in and first provisioning flow

Key deliverables:

- live admin-console domain
- configured internal admin shared-password/session auth
- working connectivity to live `/v1/internal/*` backend APIs
- validated internal onboarding path for client/location/owner setup

Dependencies:

- `AC-V1-02`
- `AC-V1-03`

Acceptance criteria:

- the LatteLink team can sign into the live admin console and complete the first real provisioning flow without raw DB or shell manipulation

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
- `done`: analytics hooks, CTA tracking, metadata, manifest, sitemap, robots, and social image baseline are in place, the Vercel lane is scoped correctly to the app directory, and a production env preflight now validates lead-routing and analytics config before deploy
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

The next useful execution step is to move the still-blocked items out of repo work and into rollout work in this order:

1. backend host bootstrap, GitHub vars/secrets, first GHCR image publish, `deploy-free`, and the first live smoke check
2. client dashboard Vercel project/domain setup, production API base URL, and deployed-browser QA
3. Google OAuth client credentials plus redirect URI validation on the live dashboard domain
4. mobile Expo/EAS and App Store Connect setup, first internal or TestFlight pilot build, and real-device QA against the deployed backend
5. live Clover and Apple Pay production credentials, webhook secret rollout, and provider validation against the deployed backend
6. LatteLink production lead sink configuration and GA4 measurement ID verification in Vercel

Repo-side blockers already cleared for those rollout lanes now include:

- backend image publishing, host bootstrap, restore drills, smoke checks, and live Clover env validation
- client dashboard Vercel workflow and Google SSO rollout mapping
- mobile EAS/TestFlight env matrix and release preflight
- LatteLink Vercel env preflight for lead capture and analytics

## Additional Cross-Surface Tickets

These tickets were added after the `2026-04-02` repo-wide V1 audit.

They cover the remaining work that is still honest to call `V1`, but which is not captured cleanly enough by the surface tickets above.

### XS-V1-01 Roadmap Truth Pass

Status:

- `owner`: Codex
- `status`: validated locally, pending merge to main
- `done`: corrected the roadmap README and admin-console roadmap to reflect that the admin console app already exists in the repo, aligned the roadmap set with the current V1 deployment lanes, and cleaned stale pilot/provisioned/operator wording in the affected roadmap and spec docs so the planning set matches the current product names and onboarding model
- `blocked`: no external blocker

Goal:
Bring the roadmap and planning docs back into sync with the implemented V1 repo state.

Scope:

- update `docs/roadmaps/README.md`
- update `docs/roadmaps/admin-console-v1-v5.md`
- scan roadmap/spec docs for stale wording that no longer matches the current product:
  - `Operator Dashboard`
  - `pilot client`
  - `seeded` / `provisioned` client language where it misstates current behavior
  - `admin console does not exist in code yet`
- align roadmap wording with the actual V1 hosting model:
  - backend on `DigitalOcean` + `GHCR`
  - client dashboard on `Vercel`
  - LatteLink web on `Vercel`
  - mobile on `Expo / EAS`

Key deliverables:

- corrected roadmap assumptions
- corrected admin-console current-state description
- planning docs that describe the current product names and rollout lanes truthfully

Dependencies:

- completed repo audit

Acceptance criteria:

- no roadmap doc claims the admin console is absent from the repo
- roadmap docs use current product-facing naming where it matters
- roadmap docs describe the real V1 deployment lanes

### XS-V1-02 V1 Launch Packet Consolidation

Status:

- `owner`: Codex
- `status`: validated locally, pending merge to main
- `done`: created `docs/runbooks/v1-launch-packet.md` to consolidate the exact repo-ready to live-ready release sequence, authoritative rollout runbook links, a single external-input matrix, and the minimum evidence required for V1 launch signoff
- `blocked`: no external blocker

Goal:
Turn the current runbooks and V1 audit output into one final launch packet that can actually drive rollout.

Scope:

- define the exact release sequence from repo-ready to live-ready
- consolidate links to the authoritative runbooks
- list every external input still required and where it is used
- separate:
  - repo-complete work
  - external setup work
  - live-validation work that happens after deploy
- capture the minimum evidence expected for V1 launch readiness:
  - deployed smoke check
  - deployed browser QA
  - mobile device QA
  - restore drill transcript
  - payment/provider validation transcript

Key deliverables:

- one cross-surface launch checklist
- one external-input matrix
- one evidence checklist for live launch signoff

Dependencies:

- `XS-V1-01`

Acceptance criteria:

- a human can execute V1 rollout without reconstructing the process from multiple roadmap docs
- each external credential or hosted input is listed exactly once with its destination
- the difference between repo-ready and live-ready is explicit

### XS-V1-03 Final External Deployment, Credentials, and Live Validation

Status:

- `owner`: User + Codex
- `status`: in progress, partially validated live
- `done`: backend deployment, dashboard deployment, Google SSO rollout, LatteLink web rollout, and live lead-delivery validation are complete; the repo-side deployment workflows, env examples, and validation scripts are in place; payments remain intentionally in simulated mode for this ticket
- `blocked`: non-Apple mobile release setup, signed build completion, and real-device QA still require external accounts and hosted tooling; live Clover provider validation is now tracked separately in `XS-V1-07`

Goal:
Complete the final non-repo steps required to take V1 live.

Scope:

- backend host bootstrap on `DigitalOcean`
- GitHub vars/secrets for image publish and `deploy-free`
- first GHCR image publish and first live backend deploy
- deployed backend smoke check and restore rehearsal
- client dashboard `Vercel` project, domain, env vars, and deployed-browser QA
- LatteLink web production env verification for lead capture and analytics
- Google OAuth client credentials and redirect URI setup
- `Expo / EAS`, App Store Connect, signed build setup, and first internal/TestFlight build
- real-device mobile QA against the deployed backend

Key deliverables:

- live backend deployment
- live client dashboard deployment
- live LatteLink web verification
- first signed mobile build
- final V1 launch evidence set

Dependencies:

- `XS-V1-02`

Acceptance criteria:

- the backend is running on the real host and passes smoke checks
- the client dashboard is reachable on its real public URL
- the marketing site lead path and analytics are verified in production
- a provisioned dashboard user can authenticate on the live domain
- the live rollout can operate with payments intentionally left in simulated mode until `XS-V1-07` is completed
- a signed mobile build can complete the pilot flow against the deployed backend

### XS-V1-07 Clover Production-Mode Provider Validation

Status:

- `owner`: User + Codex
- `status`: blocked on Clover production developer/test-merchant setup and hosted webhook validation
- `done`: the rollout path, env wiring, and hosted validation checklist are defined; repo-side Clover gateway/webhook fixes are tracked separately in `BE-V1-07`
- `blocked`: Clover production app setup, production test merchant install/connect flow, webhook verification, live-mode deploy, and provider QA transcripts still require external provider access

Goal:
Validate Clover in production mode against a Clover production test merchant without connecting the pilot client's real merchant account.

Scope:

- create and configure the Clover production app
- enable Clover ecommerce permissions and REST configuration for the deployed backend callback URLs
- connect a Clover production test merchant through the repo's OAuth flow
- configure webhook verification and shared-secret rollout against the public API
- switch the deployed backend from simulated payments to live Clover mode
- capture charge, refund, and reconciliation validation evidence against the production test merchant

Key deliverables:

- Clover production app configuration
- Clover production test merchant connection
- GitHub secrets and vars for live Clover mode
- successful Clover OAuth status and webhook verification transcript
- production test merchant payment validation evidence

Dependencies:

- `XS-V1-03`
- `BE-V1-07`

Acceptance criteria:

- `deploy-free` passes with `FREE_PAYMENTS_PROVIDER_MODE=live`
- `/v1/payments/clover/oauth/status` reports `connected: true` and `credentialSource: "oauth"`
- Clover webhook verification succeeds against the public API
- the production test merchant can complete the intended live Clover validation flow without using the pilot client's real merchant

### XS-V1-04 Development Flow and Change Control

Status:

- `owner`: Codex
- `status`: validated locally, pending merge to main
- `done`: defined the exact `main`/`dev` branch flow, documented the ticket-before-change rule, documented per-ticket commit and push behavior, documented per-section PR behavior, and created the working `dev` branch from current `main`
- `blocked`: no external blocker

Goal:
Define one exact operating flow for all remaining V1 work so repo changes are ticketed, traceable, and merged in a repeatable way.

Scope:

- define `main` vs `dev` responsibilities
- require a ticket before any repo change
- require per-ticket commits on `dev`
- require push to `origin/dev` after each ticket commit
- define section-based PR flow from `dev` to `main`
- define required commit-body and PR-body content

Key deliverables:

- one documented development-flow runbook
- one active `dev` branch on `origin`
- one required commit and PR format tied to ticket IDs

Dependencies:

- none

Acceptance criteria:

- no repo change proceeds without a ticket in this document
- each commit includes `Tickets` and `Change log`
- each PR from `dev` to `main` lists all included tickets
- `dev` exists locally and on `origin` from current `main`
- ticket sections are the default PR grouping boundary

### XS-V1-05 Versioning and Release Identification

Status:

- `owner`: Codex
- `status`: superseded by `XS-V1-06` before merge to main
- `done`: captured an initial repo versioning draft around the existing `Changesets` tooling and helper scripts
- `blocked`: the final founder-selected versioning policy differs from that initial draft and must replace it before merge to main

Goal:
Define one exact versioning flow for the remaining V1 work so release identity, semantic version bumps, and PR version impact are explicit and repeatable.

Scope:

- standardize on semantic versioning for repo releases
- use the existing `Changesets` tooling already configured in the repo
- define when a ticket requires a changeset versus `version impact: none`
- define the section-close versioning step before opening a `dev` to `main` PR
- define PR requirements for target version and version impact
- reserve `1.0.0` for the first real live V1 deployment

Key deliverables:

- one documented versioning runbook
- development-flow rules updated to reference the versioning flow
- root package scripts for `Changesets` create, status, and version commands

Dependencies:

- `XS-V1-04`

Acceptance criteria:

- the repo has one documented versioning source of truth and flow
- version-affecting tickets have an explicit versioning path
- section PRs from `dev` to `main` state target version and version impact
- `1.0.0` is explicitly reserved for the first live V1 deployment
- versioning uses the repo's existing `Changesets` setup instead of an ad hoc process

### XS-V1-06 Final Versioning Flow Alignment

Status:

- `owner`: Codex
- `status`: validated locally, pending merge to main
- `done`: aligned the repo versioning flow to the final agreed policy, documented milestone-based major versions, documented capability-based minor and fix-based patch versions, defined `main` Git tags as the official source of truth, defined section-level version cuts, documented the post-launch hotfix exception, and removed the stale `Changesets`-specific instructions added by the draft policy
- `blocked`: no external blocker

Goal:
Replace the provisional versioning draft with the exact versioning policy that will govern V1 through V5 delivery.

Scope:

- keep one repo-wide semantic version
- define `major` as completion of a full roadmap milestone version such as `V1`, `V2`, or `V3`
- define `minor` as a meaningful shipped capability
- define `patch` as fixes, polish, hardening, or non-capability improvements
- keep docs/process/test/internal-only work at `version impact: none`
- make the section `dev` to `main` PR the point where the bump is chosen
- make `main` Git tags the official released-version source of truth
- require each release PR to state target version, bump type, why the bump is justified, affected surfaces, and included ticket IDs
- require mobile app version alignment with the repo version
- define the post-launch `hotfix/*` flow from `main` back into `dev`

Key deliverables:

- one revised versioning runbook that matches the final policy
- one revised development-flow runbook that matches the final policy
- removal of the stale `Changesets` helper-script workflow introduced by the draft versioning policy

Dependencies:

- `XS-V1-04`
- `XS-V1-05`

Acceptance criteria:

- the repo uses one semantic version across the whole product
- `major` versions map to completed roadmap milestone versions
- actual version bumps are selected at the section PR level, not per ticket
- official released versions exist only as Git tags on `main`
- release PRs include target version, bump type, why the bump is justified, affected surfaces, and included ticket IDs

### XS-V1-07 GitHub Versioning Enforcement and Release Automation

Status:

- `owner`: Codex
- `status`: validated locally, pending merge to main
- `done`: updated the GitHub pull request template to require release metadata, added a GitHub workflow that validates versioning fields on PRs into `main`, replaced the stale `Changesets`-based release workflow with a semver tag-and-release workflow on `main`, removed the stale `Changesets` config and dependency footprint, and aligned versioning docs with the GitHub implementation
- `blocked`: no external blocker

Goal:
Implement the repo's final versioning flow on GitHub so PRs, release tagging, and release creation all follow the same policy already documented in the repo.

Scope:

- enforce versioning metadata in the GitHub PR template
- validate versioning metadata on pull requests to `main`
- replace the old `Changesets` release automation with a GitHub release workflow that cuts semver tags from `main`
- remove stale `Changesets` config files and dependency wiring that no longer match the chosen release model
- document the GitHub-side release path in the runbooks

Key deliverables:

- one GitHub PR template that includes required versioning fields
- one PR validation workflow for versioning metadata on `main` pull requests
- one release workflow that creates official semver tags and GitHub releases from `main`
- removal of stale `Changesets` repo config and dependency wiring

Dependencies:

- `XS-V1-04`
- `XS-V1-06`

Acceptance criteria:

- pull requests to `main` fail if required versioning metadata is missing or invalid
- the GitHub release workflow only creates valid semantic-version tags from `main`
- GitHub releases are created from the same semver tags that define official released versions
- the repo no longer exposes a stale `Changesets` release path in GitHub workflows or package dependencies

### XS-V1-08 Squash-Merge Dev Reset Rule

Status:

- `owner`: Codex
- `status`: validated locally, pending merge to main
- `done`: documented that `main` is squash-merge-only, documented that `dev` is disposable after each merged `dev` to `main` PR, added the exact post-merge reset sequence for recreating `dev` from current `main`, and clarified the required force-push behavior for refreshing `origin/dev` after a squash merge
- `blocked`: no external blocker

Goal:
Make the branch-reset behavior explicit so the `dev` branch does not drift after squash-only merges to `main`.

Scope:

- document the squash-only merge assumption for `main`
- document that `dev` is disposable after each merged section PR
- define the exact local reset sequence from updated `main`
- define the required remote `origin/dev` refresh after the reset
- clarify that the old pre-merge `dev` history is not preserved as the next working branch tip

Key deliverables:

- one updated development-flow runbook with squash-only post-merge reset instructions
- one explicit rule that `dev` is recreated or reset from merged `main` after every squash merge

Dependencies:

- `XS-V1-04`

Acceptance criteria:

- the docs state that `main` uses squash-only merges
- the docs state that `dev` is disposable after each merged `dev` to `main` PR
- the docs provide exact commands or equivalent steps for resetting local `dev` from updated `main`
- the docs require refreshing `origin/dev` after the post-merge reset
- post-launch hotfix flow is documented as `main` -> `hotfix/*` -> `main` -> `dev`

### XS-V1-09 Automated Immutable Free-First Image Promotion

Status:

- `owner`: Codex
- `status`: validated locally, pending merge to main
- `done`: changed `deploy-free` to auto-consume the just-published immutable SHA tag after successful `publish-free-images` runs on `main`, kept manual image-tag override support for rollback and explicit redeploys, and aligned the free-first deployment docs with the automated release path
- `blocked`: no external blocker

Goal:
Remove the manual `FREE_IMAGE_TAG` update step from normal free-first releases without giving up immutable-image deploys or rollback clarity.

Scope:

- trigger `deploy-free` automatically after successful `publish-free-images` runs on `main`
- resolve the deployed image tag from the just-published commit SHA by default
- preserve manual `workflow_dispatch` image-tag overrides for rollback and explicit redeploys
- downgrade `FREE_IMAGE_TAG` from required release input to optional manual override in the runbooks
- document the expected path for image publish, automatic deploy, and manual infra-only redeploys

Key deliverables:

- one `deploy-free` workflow that deploys the exact SHA published by the preceding image workflow on `main`
- updated free-first release docs that no longer require editing `FREE_IMAGE_TAG` on every backend release
- one explicit rollback path that still accepts an immutable tag override

Dependencies:

- `BE-V1-01`
- `XS-V1-03`

Acceptance criteria:

- successful `publish-free-images` runs on `main` automatically trigger `deploy-free`
- the automatic deploy uses the matching `sha-<12>` image tag from the published commit by default
- operators can still run `deploy-free` manually with an explicit image-tag override for rollback or redeploys
- the runbooks describe `FREE_IMAGE_TAG` as an optional manual override instead of a required per-release variable update
