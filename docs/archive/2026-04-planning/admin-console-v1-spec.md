# Admin Console V1 Spec

Last updated: `2026-04-02`

## Purpose

Define the first real internal control plane for LatteLink so new clients can be onboarded without raw database edits, ad hoc shell work, or undocumented engineering steps.

This app is for LatteLink internal staff only.

It is not:

- the client dashboard
- a support-only read tool
- a public onboarding portal

## V1 Outcome

At the end of `V1`, a LatteLink team member should be able to:

1. create a new client record
2. create the first store/location for that client
3. configure the store capabilities required for launch
4. provision the first owner account
5. hand off first-time access cleanly

That flow should happen through supported product surfaces and backend APIs, not improvised scripts.

## Product Scope

### In Scope

- internal admin authentication
- client creation
- first location creation
- first-owner provisioning
- launch capability configuration
- onboarding status visibility
- internal deployment target and route map

### Explicitly Out of Scope

- billing and subscriptions
- refunds and support tooling
- multi-location portfolio management beyond the first location
- full audit/event history UI
- impersonation
- client self-serve onboarding

## User Roles

V1 should support these internal roles:

- `platform_owner`
  - full control over client creation, location creation, owner provisioning, and capability configuration
- `platform_operator`
  - can create and edit clients and locations, but cannot manage internal admin accounts
- `support_readonly`
  - can inspect onboarding state and configuration, but cannot mutate client records

The V1 UI only needs to expose the first two roles directly. `support_readonly` can exist in the auth and permission model before it gets a rich surface.

## Architecture Decision

### Chosen Frontend Stack

Use `Next.js App Router` for the admin console.

Planned app location:

- `apps/admin-console`

### Why Next.js Here

This app is a better fit for `Next.js` than `Vite` because the internal control plane benefits from:

- server-aware route protection
- route-first wizard flows
- internal-only layouts and middleware gates
- future support tooling that will likely need server-side data loading and stronger auth boundaries
- a simpler path to sharing some design primitives and deployment posture with `apps/lattelink-web`

This is different from the client dashboard, which remains a better fit for `Vite` because it is a store-scoped operational SPA.

### Deployment Decision

Deploy the admin console on `Vercel`.

Planned domain:

- `admin.<primary-domain>`

Reasons:

- low-friction monorepo deployment
- preview deployments on pull requests
- no extra static-hosting work on the DigitalOcean backend host
- clean separation from the API/runtime host

## Authentication Decision

### V1 Auth Model

Use dedicated internal admin accounts, separate from client dashboard operator accounts.

Do not reuse:

- operator sessions
- client owner identities
- client dashboard roles

V1 authentication should be:

- email and password for allowlisted LatteLink team members
- backed by the identity service
- issued as internal-admin sessions distinct from operator sessions

### Future Direction

Preferred V1.2+ direction:

- Google Workspace SSO for LatteLink internal users
- optional edge gate via Cloudflare Access once available

But the actual V1 build target should not depend on having Google Workspace or Cloudflare configured first.

## Tenancy and Data Model Assumptions

### V1 Tenant Model

For the internal console, `V1` still operates on the current platform reality:

- one client maps to one primary store/location
- the backend source of truth is still largely `locationId`

The admin console should treat the primary managed entity as a `client` record that wraps:

- display/business identity
- one initial `locationId`
- launch status
- first-owner access state
- current store capability configuration

### Future-Compatible Direction

The V1 console should be designed so it can evolve into:

- `organizationId`
  - top-level client tenant
- `locationId`
  - one or more stores under that organization

That means the V1 UI should use language like `client` and `location`, even if the backend is still effectively location-scoped underneath.

## Information Architecture

### Primary Routes

- `/sign-in`
  - internal admin authentication
- `/clients`
  - client list and onboarding status
- `/clients/new`
  - new client wizard
- `/clients/[clientId]`
  - client overview and launch state
- `/clients/[clientId]/capabilities`
  - store capability configuration
- `/clients/[clientId]/owner`
  - first-owner provisioning and reset flow

### V1 Navigation

The left-side nav should be minimal:

- Clients
- New Client
- Launch Readiness
- Settings

The app does not need a wide, multi-domain internal IA yet. V1 should stay focused on client onboarding and configuration.

## V1 Screens

### 1. Sign-In

Purpose:

- secure internal access for LatteLink team members

Requirements:

- email/password form
- failed-auth messaging
- session persistence
- sign-out

### 2. Client List

Purpose:

- show all clients and where they are in onboarding

Columns:

- client name
- location name
- owner status
- capabilities status
- launch status
- last updated

Primary actions:

- open client
- create client

### 3. New Client Wizard

Purpose:

- create a new client without engineering improvisation

Wizard steps:

1. client details
2. location details
3. capability setup
4. owner provisioning
5. launch summary

### 4. Client Overview

Purpose:

- view the state of one client in one place

Sections:

- business details
- location details
- capability summary
- owner access summary
- launch readiness checklist

### 5. Capability Configuration

Purpose:

- control the V1 store behavior from one internal surface

Editable items:

- menu source
- staff dashboard enabled
- fulfillment mode
- loyalty visibility
- payment configuration readiness flags

### 6. Owner Provisioning

Purpose:

- create or reset the first owner access cleanly

Actions:

- provision owner email and display name
- generate temporary password
- show handoff instructions
- resend/reset owner access

## Core V1 Workflows

### Workflow 1: New Pilot Client Onboarding

1. Internal admin signs in.
2. Internal admin creates a client record.
3. Internal admin creates the first location.
4. Internal admin configures launch capabilities.
5. Internal admin provisions the first owner.
6. Internal admin copies the onboarding handoff details.
7. Client owner signs in to the client dashboard.

### Workflow 2: Capability Correction Before Launch

1. Internal admin opens the client overview.
2. Internal admin edits the capability set for the store.
3. Backend persists the config.
4. Mobile app and client dashboard reflect the same authoritative behavior.

### Workflow 3: Owner Access Reset

1. Internal admin opens owner provisioning for a client.
2. Internal admin triggers password reset or reprovisioning.
3. A new temporary credential is generated and recorded.
4. Internal admin hands off the updated access details.

## Backend API Requirements

These APIs are the target for `AC-V1-02`.

### Internal Admin Auth

- `POST /v1/internal/auth/sign-in`
- `POST /v1/internal/auth/logout`
- `POST /v1/internal/auth/refresh`
- `GET /v1/internal/auth/me`

### Client Provisioning

- `GET /v1/internal/clients`
- `POST /v1/internal/clients`
- `GET /v1/internal/clients/:clientId`
- `PATCH /v1/internal/clients/:clientId`

### Location Provisioning

- `POST /v1/internal/clients/:clientId/locations`
- `PATCH /v1/internal/locations/:locationId`

### Capability Configuration

- `GET /v1/internal/locations/:locationId/capabilities`
- `PUT /v1/internal/locations/:locationId/capabilities`

### Owner Provisioning

- `POST /v1/internal/locations/:locationId/owner/provision`
- `POST /v1/internal/locations/:locationId/owner/reset-password`
- `GET /v1/internal/locations/:locationId/owner`

## UI/UX Direction

The admin console should feel intentional and operational, not like a raw CRUD back office.

Design direction:

- dark shell with clear hierarchy
- restrained but premium surfaces
- compact forms
- step-based onboarding flow
- stronger table/list readability than the client dashboard

The goal is:

- more serious than the marketing site
- less client-facing than the client dashboard
- clearly an internal control plane

## Environment and Deployment Requirements

Planned V1 environment variables:

- `VITE` style variables are not preferred here because this app should be `Next.js`
- internal admin API base URL
- internal auth session settings
- optional later SSO settings

Vercel project requirements:

- root directory set to `apps/admin-console`
- preview deploys on PRs
- production deploys from `main`
- custom domain `admin.<primary-domain>` once ready

## Acceptance Criteria

`AC-V1-01` is complete when:

- the app framework choice is locked
- the auth model is locked
- the deployment target is locked
- the route/screen map is defined
- the backend API target list is defined
- the team has a clear V1 build target for the internal control plane
