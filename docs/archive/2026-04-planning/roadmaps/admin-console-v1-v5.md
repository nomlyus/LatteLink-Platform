# Admin Console Roadmap (V1-V5)

Last updated: `2026-04-02`

## Current State

A dedicated admin console app now exists in the repo at `apps/admin-console`.

The current V1 starting point is a scaffolded `Next.js` shell with the product and architecture direction defined and the initial app shell already validated locally.

That means the roadmap begins with turning the scaffold into a usable internal control plane, not with deciding whether the app should exist.

Detailed V1 build target: [admin-console-v1-spec.md](../admin-console-v1-spec.md)

This surface is for LatteLink internal admins, not client store staff.

Its job is to manage:

- client onboarding
- organization/location setup
- owner access provisioning
- feature flags and integrations
- support and platform operations

## V1

### Goal

Turn the internal control plane into a usable path for onboarding real clients cleanly.

### Scope

- product spec baseline
- app shell hardening
- internal auth model
- first onboarding and provisioning flows

### Deliverables

- admin console product spec
- scaffolded app shell and chosen deployment path
- secure internal admin authentication
- CRUD for:
  - organizations
  - locations
  - first owner account provisioning
- feature/config editing for clients
- internal-only deployment target

### Engineering Changes

- define internal admin roles
- add backend admin APIs for org/location provisioning
- add safe first-owner provisioning flow
- add clear separation between platform-admin and client-dashboard roles

### Exit Criteria

- LatteLink team can onboard a new client without using raw DB manipulation or ad hoc scripts

## V2

### Goal

Make client onboarding and support operationally usable.

### Scope

- improve onboarding workflows
- expose operational support state
- reduce manual config errors

### Deliverables

- onboarding wizard for:
  - organization creation
  - location creation
  - owner invite/provision
  - feature configuration
- basic client status pages
- integration configuration references
- support-safe ability to inspect org/location health

### Engineering Changes

- expand admin APIs around tenant provisioning
- add validation and preview layers for client configuration
- add support metadata for environment and deployment state

### Exit Criteria

- onboarding a new launch or early client is mostly console-driven
- support can inspect client status without relying on engineering shell access

## V3

### Goal

Turn the admin console into the source of truth for client and capability management.

### Scope

- full client configuration editing
- integration management
- membership visibility

### Deliverables

- client feature flag editor
- menu-source and integration configuration editor
- organization and location membership views
- owner/admin invitation state management
- operational health and recent event visibility

### Engineering Changes

- move client config away from static-only repo assumptions where appropriate
- expose backend support/audit models safely in admin APIs
- introduce support notes or client change history primitives

### Exit Criteria

- the platform no longer depends on code/config edits for routine client capability changes

## V4

### Goal

Support a growing client base with better support, billing, and platform-control workflows.

### Scope

- subscription/billing metadata
- support tools
- safer internal operations

### Deliverables

- client plan/subscription management
- tenant lifecycle states:
  - prospect
  - active pilot
  - active production
  - paused
  - churned
- safer support actions
- richer audit and event inspection
- limited, audited impersonation or troubleshooting tools if needed

### Engineering Changes

- integrate billing metadata with organization records
- add stronger permissioning for internal roles
- build safer support-action guardrails and audit requirements

### Exit Criteria

- the LatteLink team can manage a growing client portfolio through the admin console instead of bespoke processes

## V5

### Goal

Make the admin console the central platform control plane.

### Scope

- mature internal operations
- tenant lifecycle ownership
- compliance and support depth

### Deliverables

- full tenant management for organizations, locations, owners, memberships, integrations, and entitlements
- compliance-grade audit visibility
- release/feature rollout controls by client or segment
- stronger support workflows and incident context
- executive/client portfolio views

### Engineering Changes

- unify admin-console data access around organization/location platform primitives
- formalize safe support tooling, approvals, and auditability
- build toward a repeatable internal operations system

### Exit Criteria

- the admin console becomes the internal operating center for the LatteLink platform
- new client onboarding, support, and lifecycle management are controlled through productized workflows
