# Customer Frontend Roadmap (Mobile App, V1-V5)

Last updated: `2026-04-01`

## Current State

The customer-facing frontend is the Expo app in `apps/mobile`.

It already has strong foundations:

- auth flow
- menu and cart
- order placement
- Apple Pay path
- loyalty surface
- notifications groundwork
- modern UI direction

Key current gaps:

- near-real-time active order updates
- broader client configurability
- stronger production analytics/support hooks
- richer post-order and account lifecycle features
- Android and broader device/market maturity over time

Primary inputs:

- [mobile-menu-cart.md](../../../runbooks/mobile-menu-cart.md)
- [apple-pay-checkout.md](../../../runbooks/apple-pay-checkout.md)
- [replace-mobile-orders-polling-with-real-time-order-state-updates.md](../../converted-to-issues/replace-mobile-orders-polling-with-real-time-order-state-updates.md)

## V1

### Goal

Deliver a customer app that can support a real pilot store and a limited real-user run.

### Scope

- iOS-first pilot release
- sign in, menu browse, cart, checkout, order tracking
- loyalty basics
- reliable session handling

### Deliverables

- polished sign-in and session lifecycle
- menu/category browsing
- cart validation and checkout flow
- Apple Pay payment path
- order history and active order view
- manual refresh fallback for order status
- store capability-aware UI based on backend app config
- TestFlight-ready operational build process

### Engineering Changes

- finish all launch blockers for auth/session stability
- tighten empty/error/loading states
- production-safe environment handling
- instrument crash and analytics hooks
- finalize notification token registration where applicable

### Non-Goals

- no Android launch requirement unless pilot scope changes
- no deep personalization system
- no multi-location consumer UX yet

### Exit Criteria

- a pilot customer can place, pay for, and track an order
- support can reproduce and debug failures
- the app is stable enough for real trial users

## V2

### Goal

Stabilize live usage and improve the active-order experience.

### Scope

- live order updates
- better resilience
- better post-purchase experience

### Deliverables

- push-driven active order refresh
- smoother notification handling in foreground/background
- hardened auth recovery and expired-session flows
- richer order detail/timeline rendering
- better loyalty visibility and ledger clarity
- support/debug hooks for pilot incidents

### Engineering Changes

- add notification-driven order query invalidation
- improve token/session restoration across app restarts
- add analytics for funnel and failure points
- reduce retry ambiguity around checkout and order creation

### Exit Criteria

- active orders update without manual pull-to-refresh dependence
- checkout and auth support cases are materially reduced

## V3

### Goal

Make the app client-aware rather than hardcoded around one brand/store assumption.

### Scope

- client configuration and capability-driven UX
- dynamic feature exposure
- stronger account experience

### Deliverables

- runtime client config consumption for:
  - branding
  - feature toggles
  - menu source behavior
  - loyalty visibility
  - order-tracking capability
- account/profile management
- clearer location/store identity in the consumer experience
- improved configuration-aware fallbacks for unsupported features

### Engineering Changes

- remove hardcoded brand/store assumptions from UI copy and config
- use backend-provided capabilities consistently
- prepare navigation for future multi-location or multi-brand consumer behavior

### Exit Criteria

- the same app binary can behave correctly for more than one client configuration
- feature rollout no longer requires UI branching by ad hoc environment flags

## V4

### Goal

Improve retention, breadth, and day-to-day usability.

### Scope

- richer repeat-order behavior
- stronger loyalty and promotion surfaces
- broader device and market maturity

### Deliverables

- reorder / recent favorites
- improved loyalty and reward redemption UX
- personalized home states based on order history
- Android production readiness if market demand supports it
- better deep-linking from marketing and notifications
- richer support/contact flows

### Engineering Changes

- add recommendation and repeat-order primitives
- formalize growth/deep-link event instrumentation
- improve asset/config delivery for multiple clients or locations

### Exit Criteria

- the app drives repeat usage, not just first-order conversion
- mobile becomes a stronger retention channel for clients

## V5

### Goal

Turn the app into a scalable consumer product layer across multiple client organizations and stores.

### Scope

- multi-location consumer UX
- richer personalization
- stronger lifecycle/growth systems

### Deliverables

- multi-location selection or preference handling
- location-aware ordering and reorder behavior
- richer loyalty lifecycle:
  - streaks
  - personalized offers
  - targeted push journeys
- stronger account identity management
- pre-ordering, scheduling, or office/team ordering foundations if product direction supports them

### Engineering Changes

- consumer-facing location context model
- stronger event taxonomy for lifecycle marketing
- experimentation/A-B test hooks for high-traffic flows

### Exit Criteria

- the mobile app is a repeatable client product, not just a pilot storefront
- the customer frontend can scale with the rest of the platform’s multi-client model
