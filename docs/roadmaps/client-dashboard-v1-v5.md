# Client Dashboard Roadmap (V1-V5)

Last updated: `2026-04-01`

## Current State

The client dashboard lives in `apps/operator-web` and is the store-facing operational workspace.

It now has:

- a polished LatteLink-aligned UI direction
- email/password auth
- Google SSO foundation
- owner/staff role foundations
- store-scoped capabilities
- orders, menu, store settings, and team management surfaces

Key current gaps:

- productionized Google setup
- invitation/reset flows
- audit history UI
- multi-location store switching
- mature support/admin tooling around onboarding and permissions

Primary inputs:

- [operator-dashboard.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/operator-dashboard.md)
- [client-dashboard-vercel-deployment.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-vercel-deployment.md)
- [client-dashboard-google-sso.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-google-sso.md)

## V1

### Goal

Ship a single-store client dashboard that a pilot store can actually use.

### Scope

- one store per client
- `owner` and `staff` roles
- email/password sign-in
- optional Google SSO for pre-provisioned accounts
- live orders, menu controls, store settings, and staff management

### Deliverables

- production-quality dashboard shell and interaction model
- owner/staff capability enforcement
- owner-managed staff account creation
- backend-menu create/edit/remove/visibility flows
- store config editing
- live order board and status updates
- Vercel deployment lane

### Engineering Changes

- harden session refresh and auth recovery
- finish production Google SSO configuration
- tighten all error, empty, and loading states
- remove remaining single-use pilot copy or stopgap affordances

### Non-Goals

- no Apple SSO in V1
- no audit history UI in V1
- no multi-location store switcher in V1

### Exit Criteria

- one pilot client/store owner can operate the dashboard without engineering hand-holding
- staff can use it for daily order operations

## V2

### Goal

Reduce onboarding friction and improve trust and accountability.

### Scope

- invitation/setup flows
- password reset and access recovery
- production Google rollout
- activity visibility

### Deliverables

- invite-first owner onboarding flow
- temporary password and reset flows
- first activity feed or recent changes panel
- richer team-management guardrails
- more explicit capability and feature-state messaging

### Engineering Changes

- add invitation tokens and claim flows
- add audit-event read model for the dashboard
- improve team management UX around activation/deactivation and role changes
- align menu behavior clearly with `platform` vs `external` source modes

### Exit Criteria

- onboarding a new store owner is no longer manual credential passing only
- dashboard users can answer “what changed?” without asking engineering

## V3

### Goal

Prepare the dashboard for true multi-client and multi-role usage.

### Scope

- manager role activation
- location-aware foundations
- better store capability handling

### Deliverables

- visible `manager` role behavior
- cleaner permission-aware nav and home states
- menu-source-aware editing rules for external integrations
- capability-driven dashboard modules
- basic analytics/insight cards for owners

### Engineering Changes

- remove deeper single-store assumptions from session and navigation logic
- align dashboard capability model with organization/location membership design
- prepare store switcher and regional role surfaces without shipping them prematurely

### Exit Criteria

- the dashboard model can support more than owner vs staff
- client-specific behavior is driven by platform config rather than UI conditionals alone

## V4

### Goal

Support multi-location client operations and richer operational workflows.

### Scope

- multi-location navigation
- shift and exception management
- stronger order operations

### Deliverables

- store switcher for users with multiple memberships
- regional/manager operations view
- refund/cancel exception workflows
- shift notes or operational handoff notes
- richer activity and operational history views

### Engineering Changes

- add active-location session switching
- support cross-location membership resolution
- add better queue/detail views for high-throughput operations

### Exit Criteria

- one client organization can operate multiple locations through the same dashboard product

## V5

### Goal

Turn the client dashboard into a mature client operating system.

### Scope

- multi-location control surface
- richer reporting
- reusable permission templates
- stronger client trust and polish

### Deliverables

- organization-level overview with per-location drill-down
- richer reporting for orders, menu health, and staff activity
- permission templates or role packs
- location comparison views
- stronger integration awareness and support states
- optional white-label/light client-brand customization for client-facing trust

### Engineering Changes

- fully align dashboard UX to the organization/location model
- stabilize modular navigation and feature packaging
- ensure dashboard remains fast and comprehensible even as scope grows

### Exit Criteria

- the dashboard is no longer just a pilot staff tool
- it becomes a durable client product that can scale across stores and client organizations
