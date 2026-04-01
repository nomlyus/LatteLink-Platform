# Operator Dashboard Product Spec

Last updated: `2026-04-01`

## Purpose

The operator dashboard is the client-facing operations workspace for each LatteLink store.

It is not an engineering console and it should not feel like internal tooling. It is part of the store's product experience and must feel as polished, branded, and trustworthy as the customer-facing LatteLink web app.

The dashboard must support two realities at once:

- fast operational workflows for staff on a live floor
- controlled business configuration for store owners

## Product Intent

The operator dashboard should become the back-office counterpart to LatteLink:

- same visual quality as the public LatteLink web experience
- store-scoped login for owners and staff
- role-based permissions enforced by backend services
- a clear separation between operational actions and business configuration
- future-ready foundations for multi-store, multi-role, and multi-client expansion

## Primary Users

### Store Owner

The owner is responsible for store setup, menu governance, and operational permissions.

Core expectations:

- log in securely to a store-scoped workspace
- update store configuration
- manage menu items when the menu source is the platform backend
- manage staff access and role assignment
- review live orders and store operations
- control whether staff-facing live order tooling is enabled

### Staff

Staff are responsible for daily order operations.

Core expectations:

- log in securely to the same workspace with reduced permissions
- view active orders when live operations are enabled for the store
- progress operational order states when manual fulfillment is enabled
- toggle item visibility when the authoritative menu source is the platform backend
- avoid access to business-critical settings like store identity, hours policy, or staff administration

### Future User: Manager

A `manager` role should be reserved now even if it is not fully implemented in MVP.

This avoids collapsing all permissions into just `owner` and `staff` and gives room for:

- shift leads
- assistant managers
- franchise operators

## Core Product Rules

1. The dashboard is store-scoped.
2. Every operator user has a role.
3. Role checks must be enforced server-side.
4. UI visibility must reflect permissions, but must never be the only control.
5. Operator actions must call authoritative backend business logic.
6. Menu editing rules depend on the configured menu source.
7. Order operations depend on feature flags and fulfillment mode.
8. The dashboard must feel branded and premium, not generic admin software.

## Permission Model

Recommended baseline roles:

- `owner`
- `manager`
- `staff`

### Permission Matrix

| Capability | Owner | Manager | Staff |
| --- | --- | --- | --- |
| View live order board | Yes | Yes | Yes, when enabled |
| Advance manual order statuses | Yes | Yes | Yes, when enabled |
| Cancel orders | Yes | Yes | Optional, policy-driven |
| View historical orders | Yes | Yes | Yes |
| Edit store config | Yes | Limited/optional | No |
| Manage hours and pickup settings | Yes | Limited/optional | No |
| Create menu items | Yes, backend menu only | Optional | No |
| Edit menu items | Yes, backend menu only | Optional | No |
| Remove/archive menu items | Yes, backend menu only | Optional | No |
| Toggle item visibility | Yes, backend menu only | Yes, backend menu only | Yes, backend menu only |
| Manage staff accounts and roles | Yes | No | No |
| Change store-level feature settings | Yes | No | No |
| See audit history | Yes | Yes | Limited |

### MVP Role Interpretation

For the near term, the product should behave as:

- `owner`: full business and operational control
- `staff`: operational control only

The `manager` role can be modeled in contracts and permissions early, but the UI can defer it if needed.

## Functional Requirements

### 1. Authentication and Access

The operator dashboard must move from the current shared staff token model to real operator identity.

Required behavior:

- each store has operator users
- each operator user signs in with an identity-based auth flow
- the session resolves:
  - operator user id
  - role
  - store id / location id
  - allowed capabilities
- the backend enforces store and role boundaries

Current state:

- the current dashboard in `apps/operator-web` uses a browser-stored API base URL plus staff token
- gateway admin routes currently rely on `x-staff-token` in [`services/gateway/src/routes.ts`](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/services/gateway/src/routes.ts)

Gap:

- this is a stopgap only and should not be the long-term operator auth model

### 2. Live Order Board

This is the primary staff workspace.

Required behavior:

- list active orders clearly
- expose selected-order detail with line items and timeline
- show current fulfillment state
- allow operational transitions when manual fulfillment is active
- disable transitions when the store is in time-based fulfillment mode
- show clear busy, success, and failure states
- support fast scanning on desktop and tablet

Feature gating:

- live order board visibility should require a store-level operator/live-ops capability
- manual transition controls should additionally require `fulfillment.mode = "staff"`

Current backend alignment:

- admin order read and status routes already exist through gateway
- current UI already calls:
  - `GET /v1/admin/orders`
  - `GET /v1/admin/orders/:orderId`
  - `POST /v1/admin/orders/:orderId/status`

### 3. Store Configuration

Store owners must be able to manage the business-facing store identity and operating information.

Required owner actions:

- change store name
- change hours of operation
- change pickup instructions
- later: control additional store settings such as temporary closure, pickup availability, messaging, and brand details

Required rules:

- owner-only in MVP
- staff cannot edit store configuration
- every update should be auditable

Current backend alignment:

- store config read/update already exists through:
  - `GET /v1/admin/store/config`
  - `PUT /v1/admin/store/config`

### 4. Menu Management

Menu behavior must be driven by the authoritative menu source.

#### Menu Source Modes

The product should explicitly support menu source modes:

- `platform`
  - LatteLink backend is authoritative
- `external`
  - a synced external system such as Clover is authoritative

This should align with the broader menu-source work tracked in [`add-client-feature-config-and-menu-source-routing.md`](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/issues/add-client-feature-config-and-menu-source-routing.md).

#### If menu source is `platform`

Required owner actions:

- create menu items
- edit menu items
- archive/remove menu items
- reorder/categorize menu items
- change pricing and descriptive content

Required staff actions:

- toggle item visibility
- optionally edit low-risk operational fields later, if explicitly allowed

#### If menu source is `external`

Required behavior:

- operator dashboard remains usable for menu visibility and source awareness only if supported by integration design
- the UI must clearly indicate that the authoritative menu is external
- owner editing actions must be disabled unless an explicit override layer exists

This is important because the platform should not pretend it owns the menu if Clover or another provider is authoritative.

Current backend alignment:

- current contracts support reading and updating existing admin menu items
- current routes do not yet support create or remove/archive

Current gateway/catalog surface:

- `GET /v1/admin/menu`
- `PUT /v1/admin/menu/:itemId`

Required backend additions:

- create menu item
- archive/remove menu item
- possibly category management
- menu-source capability exposure in runtime config

### 5. Staff Management

This is not present today, but it is required for the long-term operator product.

Required owner actions:

- invite staff
- deactivate staff
- assign roles
- view active operator users

Required rules:

- staff cannot manage other staff
- role changes must be audited
- invitation and reset flows should be role-safe

This can be phase 2, but the product spec should assume it exists.

### 6. Feature Gating and Store Capabilities

The dashboard should render and behave according to runtime store capabilities.

The current app config contract already exposes:

- `featureFlags.staffDashboard`
- `featureFlags.menuEditing`
- `featureFlags.refunds`
- `featureFlags.orderTracking`
- `loyaltyEnabled`
- `fulfillment.mode`

Current contract reference:

- [`packages/contracts/catalog/src/index.ts`](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/packages/contracts/catalog/src/index.ts)

Recommended future additions:

- explicit operator permissions/capabilities in app config or a dedicated operator config payload
- menu source visibility
- store-level live-ops enablement
- role-derived capability payload returned at login/session time

## UX and Design Requirements

The operator dashboard must match LatteLink visually and interactively.

### Design Direction

Adopt the same high-level visual language as LatteLink:

- dark, premium surfaces
- blue accent system
- high-contrast typography
- branded motion
- refined empty, loading, and success states
- clear hierarchy and deliberate spacing

The dashboard should feel like it belongs to the same product family as:

- [`apps/lattelink-web/src/app/globals.css`](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/apps/lattelink-web/src/app/globals.css)
- [`apps/lattelink-web/src/components/Nav.tsx`](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/apps/lattelink-web/src/components/Nav.tsx)
- [`apps/lattelink-web/src/components/Hero.tsx`](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/apps/lattelink-web/src/components/Hero.tsx)

### UX Principles

1. Fast first action
   - staff should reach active orders quickly
2. Low ambiguity
   - every button should clearly communicate what it does
3. Safe destructive actions
   - cancel, remove, archive, or permission changes require confirmation
4. Buttoned-up states
   - loading, saving, error, and success states must feel intentional
5. Role-aware navigation
   - users should only see sections they can actually use
6. Mobile/tablet resilience
   - desktop first, but responsive enough for tablet counter use

### Required Screen Quality

This should not ship as a plain CRUD admin.

It should include:

- polished login screen
- branded header and workspace shell
- dense but readable order board
- premium editor patterns for menu and settings
- meaningful transition motion
- high-quality form feedback

## Current MVP Surface

Current app location:

- [`apps/operator-web`](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/apps/operator-web)

Current sections:

- `orders`
- `menu`
- `store`

Current implementation shape:

- Vite-powered SPA
- single entry in [`main.ts`](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/apps/operator-web/src/main.ts)
- API access via [`api.ts`](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/apps/operator-web/src/api.ts)
- current styles in [`styles.css`](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/apps/operator-web/src/styles.css)

This is a reasonable frontend foundation, but the product model and polish are not finished.

## Backend and Contract Requirements

### What already exists

- operator/admin read and update routes in gateway
- catalog admin contracts for:
  - admin menu read/update
  - store config read/update
- order admin routes for read and status progression
- app config feature flags and fulfillment settings

### What must be added

1. real operator auth and sessions
2. store-scoped operator identities
3. role-based authorization
4. menu create/archive/remove APIs
5. staff-management APIs
6. audit log/event model for operator actions
7. menu source exposure to the dashboard
8. clearer operator capability payloads

## Recommended Information Architecture

### Owner Navigation

- Overview
- Live Orders
- Menu
- Store Settings
- Staff
- Activity / Audit

### Staff Navigation

- Live Orders
- Menu Availability
- Shift Notes (future)

The navigation should be capability-driven, not hardcoded per user interface only.

## Screen Map

### 1. Operator Sign-In

Purpose:

- authenticate an operator user into a store-scoped workspace

Required content:

- brand-aligned sign-in shell
- email/username plus password or magic-link flow
- clear store/workspace context
- trusted-device/session messaging
- polished error and locked-state handling

Role behavior:

- same entry point for owner and staff
- post-login landing page depends on capabilities

### 2. Overview

Purpose:

- give owners and managers a quick operational snapshot

Primary content:

- live order counts
- fulfillment health
- menu availability alerts
- store-open / store-closed state
- feature status summary
- quick links into orders, menu, and store settings

Owner-focused actions:

- go to store settings
- go to staff management
- inspect recent operational activity

### 3. Live Orders

Purpose:

- provide the day-to-day operational control surface

Primary content:

- active order queue
- selected order detail
- order timeline
- operational actions

Required behaviors:

- quick scan for active orders
- prominent status visibility
- low-friction progression between states
- clear disabled state when manual fulfillment is off
- safe cancel flow with confirmation

### 4. Menu

Purpose:

- provide the operational and business menu surface

Primary content:

- category list
- item cards or table rows
- item visibility controls
- pricing and naming fields
- source-of-truth banner

Required source-aware behavior:

- if menu source is `platform`, full owner editing is enabled
- if menu source is `external`, edit controls are restricted and the UI must say why

### 5. Store Settings

Purpose:

- manage store identity and operating behavior

Primary content:

- store name
- hours
- pickup instructions
- future operational flags such as order throttling, temporary closure, or pickup messaging

Required rules:

- owner-only in MVP
- highly legible save states and auditability

### 6. Staff

Purpose:

- manage operator access

Primary content:

- current staff list
- role badges
- invite action
- deactivate action
- role assignment controls

Required rules:

- owner-only in MVP
- manager role can be enabled later

### 7. Activity / Audit

Purpose:

- provide trust and traceability for business-critical actions

Primary content:

- order state changes
- menu edits
- store config edits
- operator access changes

This can begin as a backend event log before a fully designed UI is added.

## Core User Flows

### Owner Flow

1. Sign in.
2. Land on `Overview`.
3. Review live operational health.
4. Move into:
   - `Live Orders` for intervention
   - `Menu` for edits
   - `Store Settings` for business updates
   - `Staff` for role/access management

### Staff Flow

1. Sign in.
2. Land on `Live Orders`.
3. Process active orders.
4. Optionally move into `Menu Availability` if visibility changes are allowed.

### Menu Source Flow

1. Dashboard session resolves store capabilities.
2. Dashboard receives store menu-source metadata.
3. UI chooses the correct behavior:
   - editable platform-managed menu
   - restricted external-authority menu
4. Owner and staff permissions are applied on top of that source behavior.

## Session and Capability Model

The operator dashboard needs a dedicated operator session model that is separate from the customer mobile auth model.

Recommended session payload shape:

- `operatorUserId`
- `storeId`
- `locationId`
- `role`
- `capabilities`
- `displayName`
- `storeName`

Recommended capability keys:

- `orders.read`
- `orders.write`
- `orders.cancel`
- `menu.read`
- `menu.visibility.write`
- `menu.content.write`
- `menu.structure.write`
- `store.read`
- `store.write`
- `staff.read`
- `staff.write`
- `audit.read`

Recommended product rules:

- UI derives visible sections from capabilities
- backend enforces the same capabilities
- capabilities are resolved from store scope plus role
- feature flags and menu source can further narrow available actions

## Backend and API Worklist

### Current Backend Surface

Already available:

- `GET /v1/app-config`
- `GET /v1/admin/orders`
- `GET /v1/admin/orders/:orderId`
- `POST /v1/admin/orders/:orderId/status`
- `GET /v1/admin/menu`
- `PUT /v1/admin/menu/:itemId`
- `GET /v1/admin/store/config`
- `PUT /v1/admin/store/config`

Current limitation:

- all admin routes are guarded by a shared staff token model in gateway instead of operator identity and role checks

### Required Backend Additions

#### Authentication and Session

Recommended additions:

- operator sign-in endpoint
- operator sign-out endpoint
- operator session/me endpoint
- store-scoped operator identity model

Recommended route shape:

- `POST /v1/operator/auth/login`
- `POST /v1/operator/auth/logout`
- `GET /v1/operator/session`

These names can change, but the product needs an explicit operator session surface.

#### Menu Management

Required additions:

- create menu item
- archive/remove menu item
- restore archived menu item
- optional category management

Recommended route additions:

- `POST /v1/admin/menu`
- `DELETE /v1/admin/menu/:itemId` or `POST /v1/admin/menu/:itemId/archive`
- `POST /v1/admin/menu/:itemId/restore`

#### Staff Management

Required additions:

- list staff
- invite/create staff user
- deactivate staff user
- change operator role

Recommended route additions:

- `GET /v1/admin/staff`
- `POST /v1/admin/staff`
- `PATCH /v1/admin/staff/:operatorUserId`
- `POST /v1/admin/staff/:operatorUserId/deactivate`

#### Audit Trail

Required additions:

- record admin action events for:
  - store config changes
  - menu edits
  - order state changes
  - operator access changes

Recommended route:

- `GET /v1/admin/activity`

### Contract Additions

Recommended contract work:

- operator role schema
- operator capability schema
- operator session response schema
- staff list / invite / update schemas
- menu-source field in app config or operator config payload

## Execution Sequence

### Track 1: Operator Identity and RBAC

Ship first:

- operator user model
- operator login/session contract
- gateway enforcement by role/capability
- store-scoped authorization

Reason:

- this is the architectural foundation that all later UI polish depends on

### Track 2: Store Capability and Menu Source

Ship second:

- explicit menu-source metadata
- store capability payload for operator UI
- source-aware menu behavior

Reason:

- owner/staff menu UX cannot be correct until the source-of-truth model is explicit

### Track 3: Missing Admin APIs

Ship third:

- menu create/archive
- staff management
- activity feed backend support

Reason:

- these unblock the real owner experience

### Track 4: Visual and Interaction Redesign

Ship fourth:

- LatteLink-matched shell
- redesigned live orders
- redesigned menu workspace
- redesigned settings pages
- role-aware navigation and affordances

Reason:

- the redesign should be built around the final product model, not a temporary token-based admin surface

## Definition of "On the Right Track"

We should consider the operator dashboard direction healthy if:

- new backend work moves away from shared staff tokens toward operator identity
- permissions are designed as capabilities instead of one-off UI conditions
- menu behavior is explicitly source-aware
- owner and staff experiences are separated without forking the whole app
- the redesign is treated as product work, not cosmetic cleanup

## Implementation Phases

### Phase 1: Product and Access Foundations

Goal:

- define the role model and session model before deeper UI work

Deliverables:

- operator role schema
- store-scoped operator auth design
- permission matrix
- backend enforcement plan

### Phase 2: Backend Capability Expansion

Goal:

- make the platform capable of the required owner/staff behavior

Deliverables:

- role-aware gateway/service authorization
- menu create/archive endpoints
- operator identity/session endpoints
- audit trail foundations

### Phase 3: Dashboard Redesign

Goal:

- redesign the operator app to match LatteLink visually and operationally

Deliverables:

- new design system for operator-web
- role-aware navigation and sections
- improved login flow
- premium order board, menu editor, and store-settings UI

### Phase 4: Staff Management and Advanced Operations

Goal:

- complete the operational admin product

Deliverables:

- staff invites and role management
- store-level permissions management
- audit log UI
- advanced operational modules

## Future Improvements

Likely future modules:

- refunds console
- shift notes and handoff log
- kitchen display mode
- notifications center
- analytics snapshots
- multi-location owner switcher
- integration health visibility
- external menu sync status and reconciliation tooling

## Acceptance Criteria for the Product Direction

This spec should be considered correctly implemented only when:

- owners and staff can log in with real operator identities
- permissions are enforced server-side by role and store scope
- owners can manage store config
- owners can create/edit/archive menu items when the platform backend is authoritative
- staff can access live order tooling only when enabled for the store
- staff can manage item visibility when backend-managed menu sync is active
- the dashboard reflects the store's actual runtime capabilities
- the UI feels like part of LatteLink, not a generic internal admin

## Recommended Immediate Next Step

Do not start with a visual-only redesign.

The next concrete step should be:

1. define operator auth and role contracts
2. define menu-source and capability rules for operator behavior
3. identify backend route additions and authorization changes
4. then redesign the operator UI around those real product constraints

That sequence reduces rework and ensures the eventual polished dashboard is built on the right product model.
