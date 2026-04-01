# Product Roadmaps (V1-V5)

Last updated: `2026-04-01`

## Purpose

This folder defines the V1-V5 product and engineering roadmap for each major LatteLink surface.

These roadmaps are meant to align:

- product scope
- engineering sequencing
- deployment planning
- multi-tenant platform evolution

## Surfaces

- [Execution Backlog](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/roadmaps/execution-backlog-v1-v5.md)
- [V1 Implementation Tickets](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/roadmaps/v1-implementation-tickets.md)
- [Customer Frontend (Mobile App)](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/roadmaps/customer-frontend-mobile-v1-v5.md)
- [Backend Platform](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/roadmaps/backend-v1-v5.md)
- [Client Dashboard](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/roadmaps/client-dashboard-v1-v5.md)
- [Admin Console](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/roadmaps/admin-console-v1-v5.md)
- [LatteLink Web](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/roadmaps/lattelink-web-v1-v5.md)

## Assumptions

- `V1` is the current target: pilot-production readiness.
- `V5` is the target state `5 months` from now.
- `frontend` is interpreted as the customer-facing mobile ordering app in `apps/mobile`.
- the client dashboard is the store-facing dashboard in `apps/operator-web`
- the admin console does not exist in code yet and therefore has a roadmap that begins with platform-control-plane foundations

## Release Cadence

### V1

Pilot-production readiness.

Focus:

- ship the first real client/store safely
- deploy the current stack cheaply
- remove pilot blockers

### V2

Month `1` after pilot launch.

Focus:

- stabilize live usage
- close operational gaps
- make onboarding and support less manual

### V3

Month `2`.

Focus:

- add multi-client foundations
- reduce hardcoded single-store assumptions
- formalize tenant and configuration models

### V4

Months `3-4`.

Focus:

- improve operational maturity
- support multiple locations and richer roles
- improve reporting, control, and integrations

### V5

Month `5`.

Focus:

- reach a true platform shape
- support organizations with multiple locations
- move from a pilot product to a repeatable operating system for clients

## Shared Platform Direction

All five roadmaps assume the same larger architecture goal:

- `organizationId` becomes the real tenant boundary
- `locationId` remains the operational/store boundary
- all client-facing apps consume a shared capability/config model from the backend
- onboarding becomes invitation- and membership-based, not ad hoc seeding
- each surface is independently deployable but converges on one product model
