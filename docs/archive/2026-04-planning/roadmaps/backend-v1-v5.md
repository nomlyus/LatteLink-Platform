# Backend Platform Roadmap (V1-V5)

Last updated: `2026-04-02`

## Current State

The backend already has the major service boundaries in place:

- gateway
- identity
- catalog
- orders
- payments
- loyalty
- notifications
- worker surfaces

It also already has:

- typed contracts
- free-first deployment assets
- persistence foundations
- operator/client-dashboard auth foundations
- a functioning order, payment, and loyalty baseline

Key current gaps:

- true organization-level multi-tenancy
- productionized client configuration
- admin-console APIs
- invitation-based client onboarding
- full audit/event history
- hardened live integrations and support tooling

Primary inputs:

- [architecture-overview.md](../../state-snapshots/architecture-overview.md)
- [delivery-milestones.md](../delivery-milestones.md)
- [add-client-feature-config-and-menu-source-routing.md](../../converted-to-issues/add-client-feature-config-and-menu-source-routing.md)
- [replace-temporary-time-based-order-fulfillment-progression-with-authoritative-fulfillment-state-transitions.md](../../converted-to-issues/replace-temporary-time-based-order-fulfillment-progression-with-authoritative-fulfillment-state-transitions.md)

## V1

### Goal

Be safe enough to power the first pilot store in production.

### Scope

- run the backend on the free-first host
- persist real operational data in Postgres and Valkey
- support one pilot store cleanly
- expose one stable API surface for mobile and the client dashboard

### Deliverables

- production-ready `deploy-free` flow
- backup and restore drill
- health, ready, metrics, and smoke-check discipline
- stable order lifecycle for the pilot path
- working Apple Pay/Clover pilot payment path
- client dashboard auth with role/capability enforcement
- store config and menu admin APIs for one active location
- basic push-notification and order-event delivery
- minimal client configuration for:
  - menu source
  - feature flags
  - fulfillment mode

### Engineering Changes

- finish env alignment between deploy workflow and runtime services
- make client configuration authoritative instead of environment sprawl
- tighten gateway authorization for all admin routes
- ensure payment, order, and notification idempotency is reliable
- harden operator session storage and refresh behavior
- log all critical operational mutations with request ids

### Non-Goals

- no organization-level tenant graph yet
- no self-serve client onboarding
- no enterprise auth
- no AWS migration

### Exit Criteria

- one client/store can operate for real customers
- deploy, rollback, and restore are rehearsed
- mobile ordering and client dashboard both use the same stable APIs

## V2

### Goal

Stabilize the pilot and remove manual operational pain.

### Scope

- productionize Google SSO for dashboard accounts
- add backend audit event capture
- reduce manual support and configuration drift
- improve observability and incident debugging

### Deliverables

- Google SSO fully configured for operator/client-dashboard login
- append-only audit event pipeline for:
  - login
  - staff creation/update
  - store config changes
  - menu changes
  - order state transitions
- structured support-friendly logs
- richer metrics for order failures, webhook failures, notification failures, and auth failures
- production-safe owner provisioning workflow
- integration health checks for Clover and payment dependencies

### Engineering Changes

- add `audit_events` persistence model
- introduce invitation/setup tokens for first owner and staff onboarding
- formalize service-level event taxonomy
- add operational admin endpoints for support-safe inspection
- improve retry and dead-letter behavior for notifications and integrations

### Exit Criteria

- pilot support no longer depends on digging through raw logs only
- first-time dashboard access can be created intentionally through supported flows
- Google SSO can be enabled client by client

## V3

### Goal

Introduce true multi-client foundations.

### Scope

- move from single-store assumptions to organization-aware modeling
- centralize client configuration
- make menu source and feature behavior tenant-driven

### Deliverables

- `organizations` and `locations` model
- membership-based access model that links users to orgs/locations
- typed client configuration layer
- menu-provider abstraction:
  - static/platform menu
  - Clover-backed menu
- organization/location-aware API authorization
- capability payloads resolved from membership + config

### Engineering Changes

- add `organizationId` above `locationId`
- replace default hardcoded store assumptions with explicit tenant resolution
- add a config module or service for client capabilities
- ensure mobile and client dashboard read the same resolved feature model
- formalize tenant-aware keys for notifications, orders, and menu data

### Exit Criteria

- onboarding a second client does not require hardcoded branching
- feature behavior can differ per client safely
- the backend distinguishes client tenant from location surface

## V4

### Goal

Support multi-location operations and more serious operational maturity.

### Scope

- multi-location clients
- richer permissions and support workflows
- stronger operational tooling for fulfillment and exceptions

### Deliverables

- multi-location membership support
- manager/regional role support
- authoritative fulfillment writers with source attribution
- refund and exception workflows
- integration reconciliation jobs
- SLA-oriented metrics and alerts
- searchable audit/event views for support

### Engineering Changes

- location switch and cross-location authorization semantics
- event-driven fulfillment progression instead of read-time heuristics
- richer webhook security and replay protection
- internal support APIs for org/location troubleshooting
- per-client notification templates and operational config

### Exit Criteria

- one client can operate multiple stores safely
- support and ops teams can reason about failures quickly
- fulfillment state is authoritative and auditable

## V5

### Goal

Reach a real platform-control shape that can support repeatable growth.

### Scope

- mature tenancy model
- internal control plane support
- strong integration and reporting foundations
- infrastructure path ready to graduate when justified

### Deliverables

- full organization/location membership graph
- entitlement-aware feature management
- admin-console-ready backend APIs
- organization billing/subscription metadata support
- compliance-grade audit/event model
- partner/integration management layer
- migration plan for moving from the free-first host to a larger infra target when traffic justifies it

### Engineering Changes

- formal service ownership for tenant lifecycle
- per-tenant secrets and integration references
- long-term queue/outbox reliability patterns
- cross-surface analytics/event warehouse feeds
- internal impersonation/support tooling with strict audit protection

### Exit Criteria

- LatteLink can onboard and operate multiple client organizations with multiple stores
- the backend is no longer shaped like a single-client pilot
- the rest of the product surfaces can build on stable tenant, membership, and capability primitives
