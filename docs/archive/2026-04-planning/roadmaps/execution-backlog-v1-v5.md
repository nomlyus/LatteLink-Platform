# Execution Backlog (V1-V5)

Last updated: `2026-04-01`

## Purpose

This document converts the V1-V5 roadmap set into a concrete cross-surface execution backlog.

It is organized by release and by product surface:

- backend platform
- customer frontend mobile app
- client dashboard
- admin console
- LatteLink web

Use it as the working delivery order, not just a vision document.

## Planning Rules

- `V1` means pilot-production readiness.
- `V2` means stabilization after live pilot usage.
- `V3` introduces real multi-client foundations.
- `V4` expands multi-location operations and operational maturity.
- `V5` targets a real platform shape five months out.

Priority meanings:

- `P0`: release-blocking
- `P1`: important within the version
- `P2`: valuable but deferrable within the version

## V1 Backlog

### Release Goal

Put the first real client/store into a controlled pilot-production run.

### Backend Platform

- `P0` finish free-first deployment alignment
  - align `deploy-free` and runtime env writing
  - confirm GHCR image path strategy
  - validate health, ready, metrics, and docs routes on the target host
- `P0` stabilize production persistence
  - confirm Postgres and Valkey runtime config
  - run backup and restore drill
  - remove any pilot-critical in-memory assumptions
- `P0` harden order/payment path
  - verify Clover and Apple Pay happy path
  - confirm idempotency on quote, create, and payment confirmation
  - confirm order status timeline correctness
- `P0` harden client dashboard auth foundation
  - password sign-in
  - operator session refresh and logout
  - role/capability enforcement on gateway admin routes
- `P1` formalize minimal client/store config
  - menu source
  - fulfillment mode
  - staff dashboard flag
  - loyalty visibility
- `P1` improve operational logs and smoke checks
  - request ids everywhere
  - structured logs for key mutation paths

Dependencies:

- client dashboard V1 depends on these auth and admin APIs
- mobile V1 depends on order/payment/menu/config stability

### Customer Frontend Mobile App

- `P0` finish pilot purchase flow
  - sign in
  - browse menu
  - cart
  - Apple Pay checkout
  - order history
- `P0` harden session lifecycle
  - startup restore
  - refresh
  - sign-out
  - clear recovery from invalid/expired sessions
- `P0` tighten customer-visible states
  - menu loading/failure
  - checkout failure and retry
  - active-order empty/error states
- `P1` ensure production env discipline
  - API base config
  - payment config
  - notification config
- `P1` prepare TestFlight pilot build flow
  - build profiles
  - internal testing flow
  - release checklist

Dependencies:

- backend deployment and payment stability

### Client Dashboard

- `P0` complete owner/staff operational MVP
  - live orders
  - menu editing
  - store settings
  - team management
- `P0` finish local QA and first production deploy path
  - deploy lane
  - smoke check
  - domain and TLS if shipping publicly
- `P0` remove pilot-unsafe UX issues
  - auth edge cases
  - unclear permission states
  - broken empty/error states
- `P1` enable Google SSO if needed for the pilot
  - credentials
  - redirect URIs
  - tested provisioned-account linking
- `P1` formalize owner provisioning runbook
  - first owner creation
  - temporary password or Google-first flow
  - first-time access steps

Dependencies:

- backend auth and staff-management APIs
- backend deploy or a public API tunnel

### Admin Console

- `P0` define V1 admin-console scope
  - internal-only control plane
  - not client-facing
- `P0` decide app architecture and auth model
  - likely web app
  - internal role model
- `P1` implement the minimum backend APIs it will need later
  - organization/client provisioning endpoints
  - location provisioning endpoints
  - owner provisioning endpoint or service path

Dependencies:

- backend tenant model direction

### LatteLink Web

- `P0` keep production landing page stable
  - domain
  - metadata
  - basic SEO
  - CTA sanity
- `P1` improve conversion basics
  - real contact/booking CTA
  - trust proof
  - analytics
- `P1` keep copy aligned with real product scope
  - avoid fake claims
  - align with pilot reality

Dependencies:

- none blocking pilot operations

### V1 Exit Gate

- first client/store can place real orders and operate the dashboard
- deployment, smoke checks, and rollback are documented
- pilot onboarding is deliberate, not improvised

## V2 Backlog

### Release Goal

Stabilize the pilot and reduce operational/manual overhead.

### Backend Platform

- `P0` add audit event capture
  - auth events
  - menu mutations
  - store setting changes
  - staff/user changes
  - order state transitions
- `P0` add invitation/setup flow backend support
  - owner invite/claim
  - staff invite/claim
  - password reset
- `P1` productionize Google SSO
  - account linking policy
  - verified-email enforcement
  - support logging
- `P1` improve observability
  - integration failure metrics
  - auth failure metrics
  - notification pipeline visibility

### Customer Frontend Mobile App

- `P0` replace manual active-order refresh dependence
  - push-driven invalidation
  - foreground/background refresh behavior
- `P1` improve post-purchase experience
  - richer timeline
  - clearer status language
  - better order detail
- `P1` add analytics for funnel diagnosis

### Client Dashboard

- `P0` add invite/reset flows to reduce manual provisioning pain
- `P0` surface recent activity / change history
- `P1` improve role/capability messaging in UI
- `P1` polish onboarding and support affordances

### Admin Console

- `P0` build the first internal admin app shell
- `P0` add organization/location/owner onboarding flow
- `P1` add client status and health views

### LatteLink Web

- `P0` strengthen conversion flow
  - real booking
  - real forms
  - qualification logic
- `P1` add proof/case-study and pilot messaging

### V2 Exit Gate

- operating the pilot no longer depends on ad hoc manual engineering actions
- onboarding and support become more structured

## V3 Backlog

### Release Goal

Introduce real multi-client foundations.

### Backend Platform

- `P0` add `organizationId` above `locationId`
- `P0` introduce membership-based access model
- `P0` implement typed client configuration
  - feature flags
  - menu source
  - integration refs
  - fulfillment mode
- `P1` add provider-based menu resolution
  - platform/static
  - Clover
- `P1` refactor authorization and config reads around tenant primitives

### Customer Frontend Mobile App

- `P0` consume backend-driven client config consistently
- `P1` remove hardcoded brand/store assumptions
- `P1` support feature-capability driven UX branches safely

### Client Dashboard

- `P0` support the `manager` role visibly
- `P1` align UI to capability-driven sections
- `P1` reflect menu-source mode clearly

### Admin Console

- `P0` become the source of truth for client config management
- `P0` expose org/location membership and capability editing
- `P1` add integration-reference management

### LatteLink Web

- `P0` add more product/feature pages
- `P1` build content structure for client education and growth

### V3 Exit Gate

- second and third clients can be onboarded without hardcoded product behavior
- tenant, location, and capability behavior are explicit platform concepts

## V4 Backlog

### Release Goal

Support multi-location operations and deeper operational maturity.

### Backend Platform

- `P0` add multi-location membership support
- `P0` replace any remaining fulfillment heuristics with authoritative writers
- `P1` add refund/exception workflows
- `P1` improve support and reconciliation tooling

### Customer Frontend Mobile App

- `P1` improve repeat-order and retention flows
- `P1` expand loyalty and customer lifecycle features
- `P2` prepare Android production if it matches market demand

### Client Dashboard

- `P0` add store switcher for multi-location users
- `P1` add richer queue/detail operations
- `P1` add shift-note or operational handoff features
- `P1` expand activity history and exception management

### Admin Console

- `P0` add subscription/lifecycle management
- `P1` add safer support tools and guarded internal actions
- `P1` add richer audit/event inspection

### LatteLink Web

- `P0` support segment-specific landing pages
- `P1` add experimentation and CRM-aware flows
- `P1` connect inbound leads more tightly to onboarding systems

### V4 Exit Gate

- one client organization can run multiple stores on the platform
- support, ops, and product surfaces all understand organization vs location

## V5 Backlog

### Release Goal

Reach a real platform shape five months out.

### Backend Platform

- `P0` finalize organization/location membership model as the platform core
- `P0` add entitlements/plan-aware feature management
- `P1` support admin-console-grade support and billing APIs
- `P1` prepare infra graduation path when usage justifies it

### Customer Frontend Mobile App

- `P0` add multi-location customer behavior where product direction supports it
- `P1` add richer personalization and lifecycle journeys
- `P1` make the app an acquisition and retention channel, not just ordering utility

### Client Dashboard

- `P0` support organization-level client operations across locations
- `P1` add higher-value reporting, permissions templates, and comparative views
- `P1` keep UX fast and readable despite much broader scope

### Admin Console

- `P0` become the internal platform control plane
- `P1` support tenant lifecycle, entitlements, support, and compliance workflows end to end

### LatteLink Web

- `P0` become the front door for acquisition, education, and onboarding-start flows
- `P1` support stronger content, proof, and self-serve qualification paths

### V5 Exit Gate

- the company is no longer operating a single-client pilot stack
- the platform can repeatably support multiple organizations, multiple locations, and multiple product surfaces

## Immediate Next Planning Step

After this document, the next useful move is to split `V1` into concrete implementation tickets by surface:

- `backend V1 tickets`
- `mobile V1 tickets`
- `client dashboard V1 tickets`
- `admin console V1 tickets`
- `LatteLink web V1 tickets`

That will turn the roadmap set into an actually schedulable build plan.
